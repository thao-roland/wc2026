(async function () {
  const user = await WC.requireUser();
  if (!user) return;

  const root = document.getElementById('root');
  const gid = Number(WC.qs('id'));
  if (!Number.isInteger(gid)) {
    root.innerHTML = '<p class="alert">Missing group id.</p>';
    return;
  }

  async function fetchAll() {
    const groupP = WC.sb
      .from('groups').select('id, name, invite_code, created_by').eq('id', gid).single();
    const membersP = WC.sb
      .from('group_members')
      .select('status, joined_at, user_id, profiles!inner(id, username)')
      .eq('group_id', gid)
      .order('status', { ascending: true })
      .order('joined_at', { ascending: true });
    const lbP = WC.sb.rpc('group_leaderboard', { p_group_id: gid });
    const [g, m, l] = await Promise.all([groupP, membersP, lbP]);
    if (g.error) throw g.error;
    if (m.error) throw m.error;
    if (l.error) throw l.error;
    return { group: g.data, members: m.data, leaderboard: l.data };
  }

  async function load() {
    let res;
    try { res = await fetchAll(); }
    catch (ex) { root.innerHTML = `<p class="alert">${ex.message}</p>`; return; }

    const { group, members, leaderboard } = res;
    const is_owner = group.created_by === user.id;
    const active = members.filter((x) => x.status === 'active');
    const pending = members.filter((x) => x.status === 'pending');

    root.innerHTML = '';

    root.append(WC.el('header', { class: 'flex-between fade-in', style: 'flex-wrap:wrap;margin-bottom:18px' },
      WC.el('div', {},
        WC.el('h1', { class: 'page', style: 'margin:0' }, group.name),
        WC.el('p', { class: 'muted', style: 'margin:6px 0 0;font-size:13px' },
          'Invite code: ', WC.el('span', { class: 'mono' }, group.invite_code),
        ),
      ),
      WC.el('p', { class: 'muted', style: 'font-size:13px' },
        `${active.length} member${active.length === 1 ? '' : 's'}`),
    ));

    // leaderboard
    const lb = WC.el('section', { class: 'card fade-in', style: 'margin-bottom:18px' },
      WC.el('h2', { class: 'section' }, 'Leaderboard'),
    );
    const table = WC.el('table', { class: 'lb' });
    table.innerHTML = `
      <thead><tr>
        <th style="width:36px">#</th><th>Player</th>
        <th class="num">Points</th><th class="num">Exact</th><th class="num">Winners</th>
      </tr></thead>`;
    const tbody = WC.el('tbody');
    leaderboard.forEach((r, i) => {
      const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1;
      const tr = WC.el('tr', { class: r.user_id === user.id ? 'me' : '' });
      tr.innerHTML = `
        <td style="font-weight:800">${rank}</td>
        <td style="font-weight:700">${r.username}${r.user_id === user.id ? ' <span class="chip chip-green">you</span>' : ''}</td>
        <td class="pts">${r.total_points}</td>
        <td class="num">${r.exact_scores}</td>
        <td class="num">${r.correct_winners}</td>
      `;
      tbody.append(tr);
    });
    table.append(tbody);
    lb.append(WC.el('div', { style: 'overflow-x:auto' }, table));
    root.append(lb);

    // pending requests (owner only)
    if (is_owner && pending.length > 0) {
      const section = WC.el('section', { class: 'card fade-in', style: 'margin-bottom:18px' },
        WC.el('h2', { class: 'section' }, 'Pending requests'),
      );
      const ul = WC.el('div', { class: 'list' });
      for (const p of pending) {
        const approve = WC.el('button', { class: 'btn btn-primary' }, 'Approve');
        const reject = WC.el('button', { class: 'btn btn-ghost' }, 'Reject');
        approve.addEventListener('click', () => decide(p.user_id, 'approve'));
        reject.addEventListener('click', () => decide(p.user_id, 'reject'));
        ul.append(WC.el('div', { class: 'flex-between' },
          WC.el('span', {}, p.profiles.username),
          WC.el('div', { class: 'row-flex' }, approve, reject),
        ));
      }
      section.append(ul);
      root.append(section);
    }

    // members
    const memSection = WC.el('section', { class: 'card fade-in' },
      WC.el('h2', { class: 'section' }, 'Members'),
    );
    const grid = WC.el('div', { class: 'list' });
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(220px,1fr))';
    for (const m of active) {
      grid.append(WC.el('div', { class: 'flex-between' },
        WC.el('span', {}, m.profiles.username),
        m.user_id === group.created_by ? WC.el('span', { class: 'chip chip-gold' }, 'Owner') : null,
      ));
    }
    memSection.append(grid);
    root.append(memSection);
  }

  async function decide(uid, action) {
    if (action === 'approve') {
      const { error } = await WC.sb
        .from('group_members')
        .update({ status: 'active' })
        .eq('group_id', gid).eq('user_id', uid).eq('status', 'pending');
      if (error) return alert(error.message);
    } else {
      const { error } = await WC.sb
        .from('group_members')
        .delete()
        .eq('group_id', gid).eq('user_id', uid).eq('status', 'pending');
      if (error) return alert(error.message);
    }
    load();
  }

  load();
})();
