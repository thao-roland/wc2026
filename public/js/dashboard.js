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

  // Filet de sécurité quand l'API TheSportsDB n'a pas (encore) le
  // résultat d'un match passé. N'importe quel membre peut le saisir ;
  // le trigger Postgres recalcule les points automatiquement.
  function renderManualScoreEditor(m, onSaved) {
    const wrap = WC.el('div', { class: 'manual-score-wrap', style: 'margin-top:6px' });
    const trigger = WC.el('button', { class: 'manual-score-btn' },
      '✏ Score manquant — saisir le résultat');

    trigger.addEventListener('click', () => {
      wrap.removeChild(trigger);
      const sh = WC.el('input', { class: 'input', type: 'number', min: 0, max: 20, placeholder: '–', style: 'width:60px;font-size:16px' });
      const sa = WC.el('input', { class: 'input', type: 'number', min: 0, max: 20, placeholder: '–', style: 'width:60px;font-size:16px' });
      const status = WC.el('p', { style: 'font-size:11px;margin:6px 0 0' });
      const save = WC.el('button', { class: 'btn btn-primary', style: 'padding:8px 12px;min-height:0' }, 'Enregistrer');
      const cancel = WC.el('button', { class: 'btn btn-ghost', style: 'padding:8px 12px;min-height:0' }, 'Annuler');

      save.addEventListener('click', async () => {
        if (sh.value === '' || sa.value === '') return;
        save.disabled = true; save.textContent = '…';
        try {
          const { error } = await WC.sb.from('matches').update({
            score_home: Number(sh.value),
            score_away: Number(sa.value),
            status: 'finished',
          }).eq('id', m.id);
          if (error) throw error;
          status.textContent = 'Enregistré — points recalculés.';
          status.style.color = 'var(--pitch)';
          setTimeout(onSaved, 600);
        } catch (ex) {
          status.textContent = ex.message || 'Échec';
          status.style.color = 'var(--whistle)';
          save.disabled = false; save.textContent = 'Enregistrer';
        }
      });
      cancel.addEventListener('click', () => onSaved());

      const row = WC.el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' },
        sh, WC.el('span', { style: 'color:var(--muted)' }, ':'), sa,
        save, cancel,
      );
      wrap.append(row, status);
      sh.focus();
    });

    wrap.append(trigger);
    return wrap;
  }

  function pointChip(pts) {
    if (pts === null || pts === undefined) return null;
    // 5 = exact (best), 3 = winner+score, 2 = winner / draw, 1 = consolation/score, 0 = no prono
    const cls = pts >= 3 ? 'chip-green' : pts >= 2 ? 'chip-gold' : 'chip-slate';
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

  function stageLabel(stage) {
    return ({
      'Group Stage':   'Phase de groupes',
      'Round of 32':   '16e de finale',
      'Round of 16':   '8e de finale',
      'Quarterfinals': 'Quart de finale',
      'Semifinals':    'Demi-finale',
      'Third Place':   'Petite finale',
      'Final':         'Finale',
    })[stage] || stage;
  }

  function renderMatch(m) {
    const kickoff = new Date(m.match_date).getTime();
    const locked = m.status !== 'upcoming' || Date.now() >= kickoff;

    // Détection "live" robuste : on se fie au statut, mais on prend
    // aussi le relais si on est entre le coup d'envoi et coup d'envoi
    // + 2h30 alors que TheSportsDB tarde à basculer 'upcoming' → 'live'.
    const playingWindow = kickoff
      && Date.now() >= kickoff
      && Date.now() < kickoff + 2.5 * 60 * 60 * 1000;
    const isLive = m.status === 'live'
      || (m.status === 'upcoming' && playingWindow);
    const hasLiveScore = m.score_home !== null && m.score_away !== null;

    const liveChip = isLive
      ? WC.el('span', { class: 'chip chip-red live-pulse' }, 'EN DIRECT')
      : null;
    const liveScoreChip = isLive && hasLiveScore
      ? WC.el('span', { class: 'chip chip-live-score' },
          `${m.score_home} - ${m.score_away}`)
      : null;
    const finishedChip = m.status === 'finished'
      ? WC.el('span', { class: 'chip chip-green' }, 'TERMINÉ')
      : null;

    const meta = WC.el('div', { class: 'match-meta' },
      `${stageLabel(m.stage)}${m.group_name ? ' · Groupe ' + m.group_name : ''} · ${WC.fmtDate(m.match_date)}`,
      liveChip, liveScoreChip, finishedChip,
    );

    const teams = WC.el('div', { class: 'match-teams' },
      WC.el('span', { class: 'home' }, m.team_home),
      WC.el('span', { class: 'vs' }, 'vs'),
      WC.el('span', { class: 'away' }, m.team_away),
    );

    const left = WC.el('div', {}, meta, teams);
    if (m.status === 'finished') {
      left.append(WC.el('div', { class: 'final-score' }, `${m.score_home} – ${m.score_away}`));
    } else if (isLive && hasLiveScore) {
      left.append(WC.el('div', { class: 'final-score live-score' },
        `${m.score_home} – ${m.score_away}`));
    }

    // Liste des matchs où on autorise la saisie manuelle du score.
    // S'enrichit à la demande du user (cf. renderManualScoreEditor).
    // Liste des matchs où on garde la saisie manuelle même quand le match
    // est récent. Pour les autres, on tombe en mode 'auto' : le bouton
    // apparaît dès que le match a commencé depuis > 2h sans être marqué
    // 'finished' (TheSportsDB free a souvent du retard).
    const MANUAL_SCORE = [
      { home: 'Iraq', away: 'Norway' },
      { home: 'Portugal', away: 'DR Congo' },
      { home: 'Ghana', away: 'Panama' },
      { home: 'Czechia', away: 'South Africa' },
      { home: 'Qatar', away: 'Switzerland' },
      { home: 'Switzerland', away: 'Bosnia-Herzegovina' },
      { home: 'USA', away: 'Australia' },
      { home: 'Scotland', away: 'Morocco' },
      { home: 'Türkiye', away: 'Paraguay' },
      { home: 'Netherlands', away: 'Sweden' },
      { home: 'Spain', away: 'Saudi Arabia' },
      { home: 'Uruguay', away: 'Cape Verde' },
      { home: 'France', away: 'Iraq' },
      { home: 'Portugal', away: 'Uzbekistan' },
      { home: 'Panama', away: 'Croatia' },
      { home: 'Colombia', away: 'DR Congo' },
      { home: 'Bosnia-Herzegovina', away: 'Qatar' },
      { home: 'Czechia', away: 'Mexico' },
      { home: 'Tunisia', away: 'Netherlands' },
      { home: 'Japan', away: 'Sweden' },
      { home: 'Türkiye', away: 'USA' },
    ];
    const onWhitelist = MANUAL_SCORE.some(
      (e) => (e.home === m.team_home && e.away === m.team_away)
          || (e.home === m.team_away && e.away === m.team_home),
    );
    // Fallback auto : tout match marqué 'live' OU commencé depuis plus
    // d'1h30 (= fin de temps réglementaire) sans être marqué fini.
    // On reste large pour qu'un match qu'on voit en LIVE depuis 30 min
    // ait quand même le bouton, même si la date stockée est foireuse.
    const stale = m.status === 'live'
      || (kickoff && Date.now() >= kickoff + 90 * 60 * 1000);
    const manualEnabled = onWhitelist || stale;
    if (locked && m.status !== 'finished' && manualEnabled) {
      left.append(renderManualScoreEditor(m, load));
    }

    let right;
    if (locked) {
      if (m.prediction) {
        right = WC.el('div', { class: 'pred-locked' },
          WC.el('p', { class: 'muted', style: 'margin:0' }, 'Ton prono'),
          WC.el('p', { class: 'you' }, `${m.prediction.pred_home} – ${m.prediction.pred_away}`),
          pointChip(m.prediction.points_earned),
        );
      } else {
        right = WC.el('p', { class: 'muted', style: 'text-align:right;font-size:12px;margin:0' },
          'Verrouillé — aucun prono');
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
      const btn = WC.el('button', { class: 'btn btn-primary' }, m.prediction ? 'Modifier' : 'Parier');
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
          status.textContent = 'Enregistré';
          status.style.color = 'var(--neon)';
          load();
        } catch (ex) {
          status.textContent = ex.message || 'Échec';
          status.style.color = 'var(--danger)';
          btn.disabled = false;
          btn.textContent = m.prediction ? 'Modifier' : 'Parier';
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
    list.innerHTML = '<p class="muted">Chargement…</p>';
    try {
      const matches = await fetchData();
      list.innerHTML = '';
      if (matches.length === 0) {
        list.innerHTML = '<p class="muted">Aucun match trouvé.</p>';
        return;
      }

      const ongoing  = matches.filter((m) => m.status !== 'finished');
      const finished = matches.filter((m) => m.status === 'finished');

      // Matchs terminés : repliés tout en haut. Tu cliques quand t'as envie
      // de voir l'historique sans qu'ils prennent de la place.
      if (finished.length > 0) {
        const fold = WC.el('details', { class: 'finished-fold' });
        const summary = WC.el('summary', {},
          WC.el('span', { class: 'fold-title' }, 'Matchs terminés'),
          WC.el('span', { class: 'fold-count' }, String(finished.length)),
        );
        fold.append(summary);
        const inner = WC.el('div', { class: 'list', style: 'margin-top:12px' });
        for (const m of finished) inner.append(renderMatch(m));
        fold.append(inner);
        list.append(fold);
      }

      // Matchs à venir / en cours : affichés direct, c'est ce qu'on veut voir
      // pour pouvoir parier.
      for (const m of ongoing) list.append(renderMatch(m));
      if (ongoing.length === 0) {
        list.append(WC.el('p', { class: 'muted' }, 'Aucun match à venir dans cette catégorie.'));
      }
    } catch (ex) {
      list.innerHTML = `<p class="alert">${ex.message || 'Erreur de chargement'}</p>`;
    }
  }

  load();
  window.addEventListener('wc26:scores-synced', () => load());
})();
