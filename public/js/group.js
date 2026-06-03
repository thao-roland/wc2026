(async function () {
  const user = await WC.requireUser();
  if (!user) return;

  const root = document.getElementById('root');
  const gid = Number(WC.qs('id'));
  if (!Number.isInteger(gid)) {
    root.innerHTML = '<p class="alert">Missing group id.</p>';
    return;
  }

  async function load() {
    let mData, lData;
    try {
      [mData, lData] = await Promise.all([
        WC.api(`/api/groups/${gid}/members`),
        WC.api(`/api/groups/${gid}/leaderboard`),
      ]);
    } catch (ex) {
      root.innerHTML = `<p class="alert">${ex.message}</p>`;
      return;
    }
    const { group, members, is_owner } = mData;
    const { leaderboard, me } = lData;
    const active = members.filter((m) => m.status === 'active');
    const pending = members.filter((m) => m.status === 'pending');

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
      const tr = WC.el('tr', { class: r.user_id === me ? 'me' : '' });
      tr.innerHTML = `
        <td style="font-weight:800">${rank}</td>
        <td style="font-weight:700">${r.username}${r.user_id === me ? ' <span class="chip chip-green">you</span>' : ''}</td>
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
        approve.addEventListener('click', () => decide(p.id, 'approve'));
        reject.addEventListener('click', () => decide(p.id, 'reject'));
        ul.append(WC.el('div', { class: 'flex-between' },
          WC.el('span', {}, p.username),
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
    const grid = WC.el('div', { class: 'list', style: 'grid-template-columns: repeat(auto-fill,minmax(220px,1fr))' });
    grid.style.display = 'grid';
    for (const m of active) {
      grid.append(WC.el('div', { class: 'flex-between' },
        WC.el('span', {}, m.username),
        m.id === group.created_by ? WC.el('span', { class: 'chip chip-gold' }, 'Owner') : null,
      ));
    }
    memSection.append(grid);
    root.append(memSection);
  }

  async function decide(user_id, action) {
    await WC.api(`/api/groups/${gid}/members`, { method: 'POST', body: { user_id, action } });
    load();
  }

  load();
})();
