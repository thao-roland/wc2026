(async function () {
  const user = await WC.requireUser();
  if (!user) return;

  const root = document.getElementById('root');

  // Gate: admin = user has created at least one group.
  const { data: isAdmin, error: adminErr } = await WC.sb.rpc('is_admin');
  if (adminErr) {
    root.innerHTML = `<p class="alert">${adminErr.message}</p>`;
    return;
  }
  if (!isAdmin) {
    root.innerHTML = `
      <div class="card" style="max-width:520px">
        <h1 class="page" style="margin:0 0 6px">Admin</h1>
        <p class="muted">You need to create a group first to access the admin panel.</p>
      </div>`;
    return;
  }

  const { data: allMatches, error } = await WC.sb
    .from('matches').select('*').order('match_date').order('id');
  if (error) {
    root.innerHTML = `<p class="alert">${error.message}</p>`;
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
    const matches = !t ? allMatches : allMatches.filter((m) =>
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
      save.disabled = true; status.textContent = '';
      try {
        const patch = {
          score_home: h.value === '' ? null : Number(h.value),
          score_away: a.value === '' ? null : Number(a.value),
          status: sel.value,
        };
        const { error } = await WC.sb.from('matches').update(patch).eq('id', m.id);
        if (error) throw error;
        Object.assign(m, patch);
        // The trg_recalc_predictions trigger has already updated points.
        status.textContent = 'Saved · predictions recalculated';
        status.style.color = 'var(--neon)';
      } catch (ex) {
        status.textContent = ex.message || 'Failed';
        status.style.color = 'var(--danger)';
      } finally { save.disabled = false; }
    });

    // Manual recalc trigger: nudge by writing the same status back to force
    // the AFTER UPDATE trigger to fire again.
    const recalc = WC.el('button', { class: 'btn btn-ghost' }, 'Recalc');
    recalc.addEventListener('click', async () => {
      recalc.disabled = true; status.textContent = '';
      try {
        const { error } = await WC.sb.from('matches')
          .update({ status: m.status, score_home: m.score_home, score_away: m.score_away })
          .eq('id', m.id);
        if (error) throw error;
        status.textContent = 'Recalculated';
        status.style.color = 'var(--neon)';
      } catch (ex) {
        status.textContent = ex.message || 'Failed';
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
