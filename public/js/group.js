(async function () {
  const user = await WC.requireUser();
  if (!user) return;

  const root = document.getElementById('root');
  const gid = Number(WC.qs('id'));
  if (!Number.isInteger(gid)) {
    root.innerHTML = '<p class="alert">ID du groupe manquant.</p>';
    return;
  }

  async function fetchAll() {
    const [g, m, lb, st, up, rc, pm] = await Promise.all([
      WC.sb.from('groups').select('id, name, invite_code, created_by').eq('id', gid).single(),
      WC.sb.from('group_members')
        .select('status, joined_at, user_id, profiles!inner(id, username)')
        .eq('group_id', gid)
        .order('status', { ascending: true })
        .order('joined_at', { ascending: true }),
      WC.sb.rpc('group_leaderboard',     { p_group_id: gid }),
      WC.sb.rpc('group_stats',           { p_group_id: gid }),
      WC.sb.rpc('group_upcoming',        { p_group_id: gid, p_limit: 5 }),
      WC.sb.rpc('group_recent',          { p_group_id: gid, p_limit: 5 }),
      WC.sb.rpc('group_points_matrix',   { p_group_id: gid }),
    ]);
    for (const r of [g, m, lb, st, up, rc, pm]) if (r.error) throw r.error;
    return {
      group: g.data,
      members: m.data,
      leaderboard: lb.data,
      stats: Array.isArray(st.data) ? st.data[0] : st.data,
      upcoming: up.data || [],
      recent: rc.data || [],
      matrix: pm.data || [],
    };
  }

  async function load() {
    let res;
    try { res = await fetchAll(); }
    catch (ex) { root.innerHTML = `<p class="alert">${ex.message}</p>`; return; }

    const { group, members, leaderboard, stats, upcoming, recent, matrix } = res;
    const is_owner = group.created_by === user.id;
    const active  = members.filter((x) => x.status === 'active');
    const pending = members.filter((x) => x.status === 'pending');

    root.innerHTML = '';
    root.append(renderHeader(group, stats));
    root.append(renderStats(stats));
    root.append(renderLeaderboard(leaderboard, user.id));
    root.append(renderMatrix(matrix, user.id));
    const twoCol = WC.el('div', { class: 'group-cols fade-in' });
    twoCol.append(renderUpcoming(upcoming));
    twoCol.append(renderRecent(recent, gid));
    root.append(twoCol);
    if (is_owner && pending.length > 0) {
      root.append(renderPending(pending, gid, load));
    }
    root.append(renderMembers(active, group));
  }

  function renderHeader(group, stats) {
    return WC.el('header', { class: 'flex-between fade-in', style: 'flex-wrap:wrap;margin-bottom:18px;gap:12px' },
      WC.el('div', {},
        WC.el('h1', { class: 'page', style: 'margin:0' }, group.name),
        WC.el('p', { class: 'muted', style: 'margin:6px 0 0;font-size:13px' },
          'Code d\'invitation : ', WC.el('span', { class: 'mono' }, group.invite_code),
        ),
      ),
      WC.el('p', { class: 'muted', style: 'font-size:13px;margin:0' },
        `${stats.members_count} membre${stats.members_count === 1 ? '' : 's'}`),
    );
  }

  function renderStats(s) {
    const cards = [
      ['Matchs terminés',    s.finished_matches],
      ['Pronos déposés',     s.total_predictions],
      ['Scores exacts',      s.exact_scores],
      ['Pts moyens',         Number(s.avg_points).toFixed(2)],
      ['Meilleur coup',      s.best_score > 0 ? `${s.best_score} · ${s.best_scorer}` : '—'],
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
      WC.el('h2', { class: 'section' }, 'Classement'),
    );
    const table = WC.el('table', { class: 'lb' });
    table.innerHTML = `
      <thead><tr>
        <th style="width:36px">#</th><th>Joueur</th>
        <th class="num">Points</th><th class="num">Exacts</th><th class="num">Vainqueurs</th>
      </tr></thead>`;
    const tbody = WC.el('tbody');
    rows.forEach((r, i) => {
      const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1;
      const tr = WC.el('tr', { class: r.user_id === myId ? 'me' : '' });
      tr.innerHTML = `
        <td style="font-weight:800">${rank}</td>
        <td style="font-weight:700">${esc(r.username)}${r.user_id === myId ? ' <span class="chip chip-green">toi</span>' : ''}</td>
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

  // Tableau des points : matrice membres × matchs terminés.
  // Un joueur par ligne, un match par colonne, points dans chaque case,
  // total en bout de ligne.
  function renderMatrix(rows, myId) {
    const card = WC.el('section', { class: 'card fade-in', style: 'margin-bottom:18px' },
      WC.el('h2', { class: 'section' }, 'Tableau des points par match'),
    );

    if (rows.length === 0) {
      card.append(WC.el('p', { class: 'muted' }, 'Aucun match terminé pour l\'instant.'));
      return card;
    }

    // Group rows by match (preserve match_date order) and by user.
    const matchesById = new Map();   // match_id -> {team_home, team_away, score_home, score_away, match_date}
    const matchOrder  = [];
    const usersById   = new Map();   // user_id -> {username, points: {match_id: points, ...}, total}
    const userOrder   = [];

    for (const r of rows) {
      if (!matchesById.has(r.match_id)) {
        matchesById.set(r.match_id, {
          team_home: r.team_home, team_away: r.team_away,
          score_home: r.score_home, score_away: r.score_away,
          match_date: r.match_date,
        });
        matchOrder.push(r.match_id);
      }
      if (!usersById.has(r.user_id)) {
        usersById.set(r.user_id, { username: r.username, is_me: r.is_me, points: {}, predicted: {}, total: 0 });
        userOrder.push(r.user_id);
      }
      const u = usersById.get(r.user_id);
      u.points[r.match_id] = r.points;
      u.predicted[r.match_id] = r.pred_home !== null && r.pred_away !== null;
      u.total += (r.points || 0);
    }

    // Sort users by total desc.
    userOrder.sort((a, b) => usersById.get(b).total - usersById.get(a).total);

    const wrapper = WC.el('div', { class: 'matrix-wrap' });
    const table = WC.el('table', { class: 'matrix' });

    // Header row: empty cell, then each match abbreviated.
    const thead = WC.el('thead');
    const headRow = WC.el('tr');
    headRow.append(WC.el('th', { class: 'sticky-col' }, 'Joueur'));
    for (const mid of matchOrder) {
      const m = matchesById.get(mid);
      const abbr = `${threeLetters(m.team_home)}–${threeLetters(m.team_away)}`;
      const sub  = `${m.score_home}-${m.score_away}`;
      const th = WC.el('th', { class: 'match-col', title: `${m.team_home} ${m.score_home}-${m.score_away} ${m.team_away}` },
        WC.el('div', { class: 'abbr' }, abbr),
        WC.el('div', { class: 'sub' }, sub),
      );
      headRow.append(th);
    }
    headRow.append(WC.el('th', { class: 'total-col' }, 'Total'));
    thead.append(headRow);
    table.append(thead);

    const tbody = WC.el('tbody');
    for (const uid of userOrder) {
      const u = usersById.get(uid);
      const tr = WC.el('tr', { class: uid === myId ? 'me' : '' });
      const nameCell = WC.el('td', { class: 'sticky-col name' },
        WC.el('span', {}, u.username),
        uid === myId ? WC.el('span', { class: 'chip chip-green', style: 'margin-left:6px' }, 'toi') : null,
      );
      tr.append(nameCell);
      for (const mid of matchOrder) {
        const pts = u.points[mid];
        const had = u.predicted[mid];
        const cell = WC.el('td', { class: 'pts-cell' });
        if (!had) {
          cell.append(WC.el('span', { class: 'muted', title: 'Pas de prono' }, '–'));
        } else {
          const cls = pts >= 7 ? 'chip-green' : pts >= 2 ? 'chip-gold' : 'chip-slate';
          cell.append(WC.el('span', { class: `chip ${cls}` }, String(pts)));
        }
        tr.append(cell);
      }
      tr.append(WC.el('td', { class: 'total-cell' }, String(u.total)));
      tbody.append(tr);
    }
    table.append(tbody);
    wrapper.append(table);
    card.append(wrapper);
    card.append(WC.el('p', { class: 'muted', style: 'font-size:11px;margin:10px 0 0' },
      'Survole une colonne pour voir le match complet. – = pas de prono.'));
    return card;
  }

  function threeLetters(team) {
    // Crude abbreviation: take first 3 letters of first word, uppercase.
    const cleaned = (team || '').replace(/[^A-Za-zÀ-ÿ ]/g, '').split(/\s+/)[0] || team;
    return cleaned.slice(0, 3).toUpperCase();
  }

  function stageLabelShort(stage) {
    return ({
      'Group Stage':   'Groupes',
      'Round of 32':   '16e',
      'Round of 16':   '8e',
      'Quarterfinals': 'Quart',
      'Semifinals':    'Demi',
      'Third Place':   'P. finale',
      'Final':         'Finale',
    })[stage] || stage;
  }

  function renderUpcoming(rows) {
    const card = WC.el('section', { class: 'card fade-in' },
      WC.el('h2', { class: 'section' }, 'Prochains matchs'),
    );
    if (rows.length === 0) {
      card.append(WC.el('p', { class: 'muted' }, 'Rien à l\'horizon.'));
      return card;
    }
    const list = WC.el('div', { class: 'list' });
    for (const r of rows) {
      const predicted = r.my_pred_home !== null && r.my_pred_away !== null;
      const me = predicted
        ? WC.el('span', { class: 'chip chip-green' }, `Ton prono : ${r.my_pred_home}–${r.my_pred_away}`)
        : WC.el('span', { class: 'chip chip-gold' }, 'Pas de prono');
      list.append(WC.el('div', { class: 'mini-match' },
        WC.el('div', {},
          WC.el('p', { class: 'muted', style: 'font-size:11px;margin:0' },
            `${stageLabelShort(r.stage)}${r.group_name ? ' · ' + r.group_name : ''} · ${WC.fmtDate(r.match_date)}`),
          WC.el('p', { style: 'font-weight:700;margin:4px 0 0' },
            `${r.team_home} vs ${r.team_away}`),
        ),
        WC.el('div', { class: 'mini-right' },
          WC.el('span', { class: 'chip chip-slate', style: 'margin-bottom:6px' },
            `${r.members_predicted}/${r.members_total} ont parié`),
          me,
        ),
      ));
    }
    card.append(list);
    card.append(WC.el('p', { style: 'margin:12px 0 0;text-align:right' },
      WC.el('a', { href: '/dashboard.html', class: 'chip chip-green' }, 'Aller parier →')));
    return card;
  }

  function renderRecent(rows, groupId) {
    const card = WC.el('section', { class: 'card fade-in' },
      WC.el('h2', { class: 'section' }, 'Derniers résultats'),
    );
    if (rows.length === 0) {
      card.append(WC.el('p', { class: 'muted' }, 'Aucun match terminé.'));
      return card;
    }
    const list = WC.el('div', { class: 'list' });
    for (const r of rows) {
      const row = WC.el('div', { class: 'mini-match clickable' });
      row.append(
        WC.el('div', {},
          WC.el('p', { class: 'muted', style: 'font-size:11px;margin:0' },
            `${stageLabelShort(r.stage)}${r.group_name ? ' · ' + r.group_name : ''} · ${WC.fmtDate(r.match_date)}`),
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
            : WC.el('span', { class: 'chip chip-slate' }, 'Aucun prono'),
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
        expand.innerHTML = '<p class="muted" style="margin:8px 0 0">Chargement des pronos…</p>';
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
      'Clique sur un match pour voir les pronos de tout le monde.'));
    return card;
  }

  function renderPredictionTable(host, rows, match) {
    host.innerHTML = '';
    if (rows.length === 0) {
      host.append(WC.el('p', { class: 'muted', style: 'margin:8px 0 0' }, 'Personne n\'a parié sur celui-ci.'));
      return;
    }
    const table = WC.el('table', { class: 'lb', style: 'margin-top:8px' });
    table.innerHTML = `
      <thead><tr>
        <th>Joueur</th>
        <th class="num">Prono</th>
        <th class="num">Résultat</th>
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
        <td>${esc(r.username)}${r.is_me ? ' <span class="chip chip-green">toi</span>' : ''}</td>
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
      WC.el('h2', { class: 'section' }, `Demandes en attente · ${pending.length}`),
    );
    const ul = WC.el('div', { class: 'list' });
    for (const p of pending) {
      const approve = WC.el('button', { class: 'btn btn-primary' }, 'Approuver');
      const reject  = WC.el('button', { class: 'btn btn-ghost' }, 'Refuser');
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
      WC.el('h2', { class: 'section' }, 'Membres'),
    );
    const grid = WC.el('div', { class: 'members-grid' });
    for (const m of active) {
      grid.append(WC.el('div', { class: 'flex-between' },
        WC.el('span', {}, m.profiles.username),
        m.user_id === group.created_by ? WC.el('span', { class: 'chip chip-gold' }, 'Créateur') : null,
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
  window.addEventListener('wc26:scores-synced', () => load());
})();
