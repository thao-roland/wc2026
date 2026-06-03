(async function () {
  const user = await WC.requireUser();
  if (!user) return;

  const root = document.getElementById('root');
  let allMatches = [];

  try {
    const { matches } = await WC.api('/api/admin/matches');
    allMatches = matches;
  } catch (ex) {
    root.innerHTML = `
      <div class="card" style="max-width:520px">
        <h1 class="page" style="margin:0 0 6px">Admin</h1>
        <p class="muted">${ex.status === 403
          ? "You need to create a group first to access the admin panel."
          : ex.message}</p>
      </div>`;
    return;
  }

  root.innerHTML = '';
  root.append(WC.el('h1', { class: 'page' }, 'Admin — match results'));
  const filter = WC.el('input', {
    class: 'input', placeholder: 'Filter by team or stage…',
    style: 'max-width:340px;margin-bottom:16px',
  });
  root.append(filter);
  const list = WC.el('div', { class: 'list' });
  root.append(list);

  filter.addEventListener('input', render);

  function render() {
    const t = filter.value.trim().toLowerCase();
    list.innerHTML = '';
    const matches = !t
      ? allMatches
      : allMatches.filter((m) =>
          m.team_home.toLowerCase().includes(t) ||
          m.team_away.toLowerCase().includes(t) ||
          m.stage.toLowerCase().includes(t) ||
          (m.group_name || '').toLowerCase().includes(t),
        );
    for (const m of matches) list.append(row(m));
  }

  function row(m) {
    const h = WC.el('input', {
      class: 'input', type: 'number', min: 0, max: 20,
      value: m.score_home === null ? '' : m.score_home,
    });
    const a = WC.el('input', {
      class: 'input', type: 'number', min: 0, max: 20,
      value: m.score_away === null ? '' : m.score_away,
    });
    const sel = WC.el('select', { class: 'input' });
    for (const s of ['upcoming', 'live', 'finished']) {
      const opt = WC.el('option', { value: s }, s);
      if (s === m.status) opt.selected = true;
      sel.append(opt);
    }
    const status = WC.el('p', { style: 'font-size:12px;margin:0' });

    const save = WC.el('button', { class: 'btn btn-primary' }, 'Save');
    save.addEventListener('click', async () => {
      save.disabled = true;
      status.textContent = '';
      try {
        const j = await WC.api(`/api/admin/matches/${m.id}`, {
          method: 'PATCH',
          body: {
            score_home: h.value === '' ? null : Number(h.value),
            score_away: a.value === '' ? null : Number(a.value),
            status: sel.value,
          },
        });
        status.textContent = `Saved · recalculated ${j.recalculated} predictions`;
        status.style.color = 'var(--neon)';
        // mutate in-place
        Object.assign(m, {
          score_home: h.value === '' ? null : Number(h.value),
          score_away: a.value === '' ? null : Number(a.value),
          status: sel.value,
        });
      } catch (ex) {
        status.textContent = ex.message;
        status.style.color = 'var(--danger)';
      } finally { save.disabled = false; }
    });

    const recalc = WC.el('button', { class: 'btn btn-ghost' }, 'Recalc');
    recalc.addEventListener('click', async () => {
      recalc.disabled = true;
      try {
        const j = await WC.api(`/api/admin/matches/${m.id}?action=recalc`, { method: 'POST' });
        status.textContent = `Recalculated ${j.recalculated} predictions`;
        status.style.color = 'var(--neon)';
      } catch (ex) {
        status.textContent = ex.message;
        status.style.color = 'var(--danger)';
      } finally { recalc.disabled = false; }
    });

    const card = WC.el('div', { class: 'card admin-row' },
      WC.el('div', {},
        WC.el('p', { class: 'muted', style: 'font-size:12px;margin:0' },
          `${m.stage}${m.group_name ? ' · Group ' + m.group_name : ''} · ${new Date(m.match_date).toLocaleString()}`,
        ),
        WC.el('p', { style: 'font-weight:800;font-size:16px;margin:4px 0 0' },
          m.team_home, ' ', WC.el('span', { class: 'muted' }, 'vs'), ' ', m.team_away,
        ),
      ),
      WC.el('div', { class: 'admin-controls' },
        h, WC.el('span', { class: 'muted' }, ':'), a, sel, save, recalc,
      ),
    );
    card.append(WC.el('div', { style: 'grid-column:1/-1' }, status));
    return card;
  }

  render();
})();
