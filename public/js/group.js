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
    const [g, m, lb, st, up, rc] = await Promise.all([
      WC.sb.from('groups').select('id, name, invite_code, created_by').eq('id', gid).single(),
      WC.sb.from('group_members')
        .select('status, joined_at, user_id, profiles!inner(id, username)')
        .eq('group_id', gid)
        .order('status', { ascending: true })
        .order('joined_at', { ascending: true }),
      WC.sb.rpc('group_leaderboard', { p_group_id: gid }),
      WC.sb.rpc('group_stats',       { p_group_id: gid }),
      WC.sb.rpc('group_upcoming',    { p_group_id: gid, p_limit: 5 }),
      WC.sb.rpc('group_recent',      { p_group_id: gid, p_limit: 5 }),
    ]);
    for (const r of [g, m, lb, st, up, rc]) if (r.error) throw r.error;
    return {
      group: g.data,
      members: m.data,
      leaderboard: lb.data,
      stats: Array.isArray(st.data) ? st.data[0] : st.data,
      upcoming: up.data || [],
      recent: rc.data || [],
    };
  }

  async function load() {
    let res;
    try { res = await fetchAll(); }
    catch (ex) { root.innerHTML = `<p class="alert">${ex.message}</p>`; return; }

    const { group, members, leaderboard, stats, upcoming, recent } = res;
    const is_owner = group.created_by === user.id;
    const active = members.filter((x) => x.status === 'active');
    const pending = members.filter((x) => x.status === 'pending');

    root.innerHTML = '';

    // --- header ---
    root.append(WC.el('header', { class: 'flex-between fade-in', style: 'flex-wrap:wrap;margin-bottom:18px;gap:12px' },
      WC.el('div', {},
        WC.el('h1', { class: 'page', style: 'margin:0' }, group.name),
        WC.el('p', { class: 'muted', style: 'margin:6px 0 0;font-size:13px' },
          'Invite code: ', WC.el('span', { class: 'mono' }, group.invite_code),
        ),
      ),
      WC.el('p', { class: 'muted', style: 'font-size:13px;margin:0' },
        `${stats.members_count} member${stats.members_count === 1 ? '' : 's'}`),
    ));

    // --- stats strip ---
    root.append(renderStats(stats));

    // --- leaderboard ---
    root.append(renderLeaderboard(leaderboard, user.id));

    // --- two-column area on wide screens ---
    const twoCol = WC.el('div', { class: 'group-cols fade-in' });
    twoCol.append(renderUpcoming(upcoming));
    twoCol.append(renderRecent(recent, gid));
    root.append(twoCol);

    // --- pending requests (owner only) ---
    if (is_owner && pending.length > 0) {
      root.append(renderPending(pending, gid, load));
    }

    // --- members ---
    root.append(renderMembers(active, group));
  }

  function renderStats(s) {
    const cards = [
      ['Matches finished',  s.finished_matches],
      ['Predictions made',  s.total_predictions],
      ['Exact scores',      s.exact_scores],
      ['Avg points',        Number(s.avg_points).toFixed(2)],
      ['Best single match', s.best_score > 0 ? `${s.best_score} · ${s.best_scorer}` : '—'],
    ];
    const strip = WC.el('section', { class: 'stats-strip fade-in' });
    for (const [label, val] of cards) {
      strip.append(WC.el('div', { class: 'stat-card' },
        WC.el('div', { class: 'stat-val' }, String(val)),
        WC.el('div', { class: 'stat-label' }, label),
      ));
    }
    return strip;
  }

  function renderLeaderboard(rows, myId) {
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
    rows.forEach((r, i) => {
      const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1;
      const tr = WC.el('tr', { class: r.user_id === myId ? 'me' : '' });
      tr.innerHTML = `
        <td style="font-weight:800">${rank}</td>
        <td style="font-weight:700">${esc(r.username)}${r.user_id === myId ? ' <span class="chip chip-green">you</span>' : ''}</td>
        <td class="pts">${r.total_points}</td>
        <td class="num">${r.exact_scores}</td>
        <td class="num">${r.correct_winners}</td>
      `;
      tbody.append(tr);
    });
    table.append(tbody);
    lb.append(WC.el('div', { style: 'overflow-x:auto' }, table));
    return lb;
  }

  function renderUpcoming(rows) {
    const card = WC.el('section', { class: 'card fade-in' },
      WC.el('h2', { class: 'section' }, 'Next matches'),
    );
    if (rows.length === 0) {
      card.append(WC.el('p', { class: 'muted' }, 'Nothing on the horizon.'));
      return card;
    }
    const list = WC.el('div', { class: 'list' });
    for (const r of rows) {
      const predicted = r.my_pred_home !== null && r.my_pred_away !== null;
      const me = predicted
        ? WC.el('span', { class: 'chip chip-green' }, `Your call: ${r.my_pred_home}–${r.my_pred_away}`)
        : WC.el('span', { class: 'chip chip-gold' }, 'No prediction');
      list.append(WC.el('div', { class: 'mini-match' },
        WC.el('div', {},
          WC.el('p', { class: 'muted', style: 'font-size:11px;margin:0' },
            `${r.stage}${r.group_name ? ' · ' + r.group_name : ''} · ${WC.fmtDate(r.match_date)}`),
          WC.el('p', { style: 'font-weight:700;margin:4px 0 0' },
            `${r.team_home} vs ${r.team_away}`),
        ),
        WC.el('div', { class: 'mini-right' },
          WC.el('span', { class: 'chip chip-slate', style: 'margin-bottom:6px' },
            `${r.members_predicted}/${r.members_total} predicted`),
          me,
        ),
      ));
    }
    card.append(list);
    card.append(WC.el('p', { style: 'margin:12px 0 0;text-align:right' },
      WC.el('a', { href: '/dashboard.html', class: 'chip chip-green' }, 'Make predictions →')));
    return card;
  }

  function renderRecent(rows, groupId) {
    const card = WC.el('section', { class: 'card fade-in' },
      WC.el('h2', { class: 'section' }, 'Recent results'),
    );
    if (rows.length === 0) {
      card.append(WC.el('p', { class: 'muted' }, 'No finished matches yet.'));
      return card;
    }
    const list = WC.el('div', { class: 'list' });
    for (const r of rows) {
      const row = WC.el('div', { class: 'mini-match clickable' });
      row.append(
        WC.el('div', {},
          WC.el('p', { class: 'muted', style: 'font-size:11px;margin:0' },
            `${r.stage}${r.group_name ? ' · ' + r.group_name : ''} · ${WC.fmtDate(r.match_date)}`),
          WC.el('p', { style: 'font-weight:700;margin:4px 0 0' },
            `${r.team_home} `,
            WC.el('span', { class: 'final-mini' }, `${r.score_home}–${r.score_away}`),
            ` ${r.team_away}`),
        ),
        WC.el('div', { class: 'mini-right' },
          WC.el('span', { class: 'chip chip-slate', style: 'margin-bottom:6px' },
            `${r.predictions_count} prono${r.predictions_count === 1 ? '' : 's'}`),
          r.best_score > 0
            ? WC.el('span', { class: 'chip chip-green' }, `+${r.best_score} · ${r.best_scorer}`)
            : WC.el('span', { class: 'chip chip-slate' }, 'No prono'),
        ),
      );
      const expand = WC.el('div', { class: 'expand-area', hidden: true });
      row.append(expand);
      row.addEventListener('click', async () => {
        if (!expand.hasAttribute('hidden')) {
          expand.setAttribute('hidden', '');
          return;
        }
        expand.removeAttribute('hidden');
        if (expand.dataset.loaded) return;
        expand.innerHTML = '<p class="muted" style="margin:8px 0 0">Loading predictions…</p>';
        const { data, error } = await WC.sb.rpc('group_match_predictions', {
          p_group_id: groupId, p_match_id: r.match_id,
        });
        if (error) {
          expand.innerHTML = `<p class="alert" style="margin:8px 0 0">${error.message}</p>`;
          return;
        }
        expand.dataset.loaded = '1';
        renderPredictionTable(expand, data, r);
      });
      list.append(row);
    }
    card.append(list);
    card.append(WC.el('p', { class: 'muted', style: 'font-size:11px;margin:12px 0 0;text-align:right' },
      'Click a match to see everyone\'s pronos.'));
    return card;
  }

  function renderPredictionTable(host, rows, match) {
    host.innerHTML = '';
    if (rows.length === 0) {
      host.append(WC.el('p', { class: 'muted', style: 'margin:8px 0 0' }, 'Nobody predicted this one.'));
      return;
    }
    const table = WC.el('table', { class: 'lb', style: 'margin-top:8px' });
    table.innerHTML = `
      <thead><tr>
        <th>Player</th>
        <th class="num">Prono</th>
        <th class="num">Result</th>
        <th class="num">Pts</th>
      </tr></thead>`;
    const tbody = WC.el('tbody');
    rows.forEach((r) => {
      const pts = r.points_earned;
      const chip = pts === null ? '' :
        pts >= 7 ? `<span class="chip chip-green">${pts}</span>` :
        pts >= 2 ? `<span class="chip chip-gold">${pts}</span>` :
                   `<span class="chip chip-slate">${pts}</span>`;
      const tr = WC.el('tr', { class: r.is_me ? 'me' : '' });
      tr.innerHTML = `
        <td>${esc(r.username)}${r.is_me ? ' <span class="chip chip-green">you</span>' : ''}</td>
        <td class="num">${r.pred_home}–${r.pred_away}</td>
        <td class="num muted">${match.score_home}–${match.score_away}</td>
        <td class="num">${chip}</td>
      `;
      tbody.append(tr);
    });
    table.append(tbody);
    host.append(table);
  }

  function renderPending(pending, groupId, refresh) {
    const section = WC.el('section', { class: 'card fade-in', style: 'margin-bottom:18px;margin-top:18px' },
      WC.el('h2', { class: 'section' }, `Pending requests · ${pending.length}`),
    );
    const ul = WC.el('div', { class: 'list' });
    for (const p of pending) {
      const approve = WC.el('button', { class: 'btn btn-primary' }, 'Approve');
      const reject  = WC.el('button', { class: 'btn btn-ghost' }, 'Reject');
      approve.addEventListener('click', async () => {
        await WC.sb.from('group_members').update({ status: 'active' })
          .eq('group_id', groupId).eq('user_id', p.user_id).eq('status', 'pending');
        refresh();
      });
      reject.addEventListener('click', async () => {
        await WC.sb.from('group_members').delete()
          .eq('group_id', groupId).eq('user_id', p.user_id).eq('status', 'pending');
        refresh();
      });
      ul.append(WC.el('div', { class: 'flex-between' },
        WC.el('span', {}, p.profiles.username),
        WC.el('div', { class: 'row-flex' }, approve, reject),
      ));
    }
    section.append(ul);
    return section;
  }

  function renderMembers(active, group) {
    const memSection = WC.el('section', { class: 'card fade-in', style: 'margin-top:18px' },
      WC.el('h2', { class: 'section' }, 'Members'),
    );
    const grid = WC.el('div', { class: 'members-grid' });
    for (const m of active) {
      grid.append(WC.el('div', { class: 'flex-between' },
        WC.el('span', {}, m.profiles.username),
        m.user_id === group.created_by ? WC.el('span', { class: 'chip chip-gold' }, 'Owner') : null,
      ));
    }
    memSection.append(grid);
    return memSection;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
    }[c]));
  }

  load();

  // Refresh group view automatically when background score sync changes data.
  window.addEventListener('wc26:scores-synced', () => load());
})();
