(async function () {
  const user = await WC.requireUser();
  if (!user) return;

  const list = document.getElementById('matches');
  const tabs = document.getElementById('tabs');
  let currentStage = 'all';

  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-stage]');
    if (!btn) return;
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    currentStage = btn.dataset.stage;
    load();
  });

  function pointChip(pts) {
    if (pts === null || pts === undefined) return null;
    const cls = pts >= 7 ? 'chip-green' : pts >= 2 ? 'chip-gold' : 'chip-slate';
    return WC.el('span', { class: `chip ${cls}`, style: 'margin-top:4px' }, `+${pts} pts`);
  }

  async function fetchData() {
    let q = WC.sb
      .from('matches')
      .select('*, predictions(id, pred_home, pred_away, points_earned)')
      .eq('predictions.user_id', user.id)
      .order('match_date', { ascending: true })
      .order('id', { ascending: true });
    if (currentStage === 'group')    q = q.eq('stage', 'Group Stage');
    if (currentStage === 'knockout') q = q.neq('stage', 'Group Stage');
    const { data, error } = await q;
    if (error) throw error;
    return data.map((m) => ({ ...m, prediction: (m.predictions || [])[0] || null }));
  }

  function renderMatch(m) {
    const kickoff = new Date(m.match_date).getTime();
    const locked = m.status !== 'upcoming' || Date.now() >= kickoff;

    const meta = WC.el('div', { class: 'match-meta' },
      `${m.stage}${m.group_name ? ' · Group ' + m.group_name : ''} · ${WC.fmtDate(m.match_date)}`,
      m.status === 'live' ? WC.el('span', { class: 'chip chip-gold' }, 'LIVE') : null,
      m.status === 'finished' ? WC.el('span', { class: 'chip chip-green' }, 'FT') : null,
    );

    const teams = WC.el('div', { class: 'match-teams' },
      WC.el('span', { class: 'home' }, m.team_home),
      WC.el('span', { class: 'vs' }, 'vs'),
      WC.el('span', { class: 'away' }, m.team_away),
    );

    const left = WC.el('div', {}, meta, teams);
    if (m.status === 'finished') {
      left.append(WC.el('div', { class: 'final-score' }, `${m.score_home} – ${m.score_away}`));
    }

    let right;
    if (locked) {
      if (m.prediction) {
        right = WC.el('div', { class: 'pred-locked' },
          WC.el('p', { class: 'muted', style: 'margin:0' }, 'Your call'),
          WC.el('p', { class: 'you' }, `${m.prediction.pred_home} – ${m.prediction.pred_away}`),
          pointChip(m.prediction.points_earned),
        );
      } else {
        right = WC.el('p', { class: 'muted', style: 'text-align:right;font-size:12px;margin:0' },
          'Locked — no prediction');
      }
    } else {
      const h = WC.el('input', {
        class: 'input', type: 'number', min: 0, max: 20, placeholder: '–',
        value: m.prediction ? m.prediction.pred_home : '',
      });
      const a = WC.el('input', {
        class: 'input', type: 'number', min: 0, max: 20, placeholder: '–',
        value: m.prediction ? m.prediction.pred_away : '',
      });
      const status = WC.el('p', { class: 'muted', style: 'font-size:12px;margin:4px 0 0;text-align:right' });
      const btn = WC.el('button', { class: 'btn btn-primary' }, m.prediction ? 'Update' : 'Predict');
      btn.addEventListener('click', async () => {
        if (h.value === '' || a.value === '') return;
        btn.disabled = true; btn.textContent = '…';
        try {
          const { error } = await WC.sb
            .from('predictions')
            .upsert({
              user_id: user.id,
              match_id: m.id,
              pred_home: Number(h.value),
              pred_away: Number(a.value),
            }, { onConflict: 'user_id,match_id' });
          if (error) throw error;
          status.textContent = 'Saved';
          status.style.color = 'var(--neon)';
          load();
        } catch (ex) {
          status.textContent = ex.message || 'Failed';
          status.style.color = 'var(--danger)';
          btn.disabled = false;
          btn.textContent = m.prediction ? 'Update' : 'Predict';
        }
      });
      right = WC.el('div', {},
        WC.el('div', { class: 'pred' }, h, WC.el('span', { class: 'colon' }, ':'), a, btn),
        status,
      );
    }

    return WC.el('div', { class: 'card match-card' }, left, right);
  }

  async function load() {
    list.innerHTML = '<p class="muted">Loading…</p>';
    try {
      const matches = await fetchData();
      list.innerHTML = '';
      if (matches.length === 0) {
        list.innerHTML = '<p class="muted">No matches found.</p>';
        return;
      }
      for (const m of matches) list.append(renderMatch(m));
    } catch (ex) {
      list.innerHTML = `<p class="alert">${ex.message || 'Failed to load matches'}</p>`;
    }
  }

  load();

  // When the background sync writes new scores, refresh the list so the
  // user sees results / leaderboard updates without reloading the page.
  window.addEventListener('wc26:scores-synced', () => load());
})();
