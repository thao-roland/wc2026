// Widget "Pronos longs" affiché en haut du dashboard et de la page groupe.
// Champs : vainqueur (select), meilleur buteur (texte), meilleur passeur (texte).
// Verrouillés dès que le premier match du tournoi a démarré.

(async function () {
  const slot = document.getElementById('picks-widget');
  if (!slot) return;

  const user = await WC.currentUser().catch(() => null);
  if (!user) return;

  // Charge en parallèle : les picks du joueur, les équipes du tournoi,
  // la date butoir (stockée dans tournament_results.picks_lock_at).
  const [picksRes, teamsRes, deadlineRes] = await Promise.all([
    WC.sb.from('tournament_picks').select('*').eq('user_id', user.id).maybeSingle(),
    WC.sb.from('wc_teams').select('team'),
    WC.sb.from('tournament_results').select('picks_lock_at').eq('id', 1).maybeSingle(),
  ]);

  const picks = picksRes.data || {};
  const teams = (teamsRes.data || []).map((r) => r.team).filter(Boolean).sort();
  const deadline = deadlineRes.data?.picks_lock_at ? new Date(deadlineRes.data.picks_lock_at) : null;
  const locked = deadline ? Date.now() >= deadline.getTime() : false;

  const card = WC.el('section', { class: 'card fade-in picks-card' });
  card.append(WC.el('h2', { class: 'section' },
    WC.el('span', {}, 'Pronos longs du tournoi'),
    WC.el('span', { class: 'picks-bonus muted', style: 'font-size:10px;letter-spacing:0.08em;margin-left:auto' },
      'Bonus : +15 / +10 / +10'),
  ));

  if (locked && !picks.user_id) {
    card.append(WC.el('p', { class: 'muted', style: 'margin:6px 0 0' },
      'Verrouillés — le tournoi a déjà commencé. Tu n\'as pas posé tes pronos longs à temps.'));
    slot.append(card);
    return;
  }

  if (locked) {
    // Read-only display
    card.append(renderPickRow('🏆 Vainqueur du tournoi',     picks.winner_team,  picks.points_winner));
    card.append(renderPickRow('⚽ Meilleur buteur',          picks.top_scorer,   picks.points_top_scorer));
    card.append(renderPickRow('🎯 Meilleur passeur',         picks.top_assister, picks.points_top_assister));
    card.append(WC.el('p', { class: 'muted', style: 'margin:12px 0 0;font-size:11px;text-transform:uppercase;letter-spacing:0.08em' },
      'Verrouillé · résultats en fin de tournoi'));
    slot.append(card);
    return;
  }

  // Editable form
  const winnerSel = WC.el('select', { class: 'input', id: 'pick-winner' });
  winnerSel.append(WC.el('option', { value: '' }, '— Choisis une équipe —'));
  for (const t of teams) {
    const opt = WC.el('option', { value: t }, t);
    if (picks.winner_team === t) opt.selected = true;
    winnerSel.append(opt);
  }

  const scorerInp = WC.el('input', {
    class: 'input', id: 'pick-scorer',
    placeholder: 'Ex : Kylian Mbappé',
    value: picks.top_scorer || '',
    maxlength: 60,
  });
  const assistInp = WC.el('input', {
    class: 'input', id: 'pick-assister',
    placeholder: 'Ex : Lionel Messi',
    value: picks.top_assister || '',
    maxlength: 60,
  });

  const status = WC.el('p', { style: 'font-size:12px;margin:0' });
  const saveBtn = WC.el('button', { class: 'btn btn-primary' }, picks.user_id ? 'Modifier' : 'Enregistrer');
  saveBtn.addEventListener('click', async () => {
    const row = {
      user_id: user.id,
      winner_team:  winnerSel.value || null,
      top_scorer:   scorerInp.value.trim() || null,
      top_assister: assistInp.value.trim() || null,
      updated_at: new Date().toISOString(),
    };
    saveBtn.disabled = true; saveBtn.textContent = '…';
    status.textContent = '';
    try {
      const { error } = await WC.sb
        .from('tournament_picks')
        .upsert(row, { onConflict: 'user_id' });
      if (error) throw error;
      status.textContent = 'Enregistré';
      status.style.color = 'var(--pitch)';
    } catch (ex) {
      status.textContent = ex.message || 'Échec';
      status.style.color = 'var(--whistle)';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Modifier';
    }
  });

  const grid = WC.el('div', { class: 'picks-grid' },
    WC.el('label', { class: 'pick-field' },
      WC.el('span', { class: 'pick-label' }, '🏆 Vainqueur du tournoi'),
      winnerSel,
    ),
    WC.el('label', { class: 'pick-field' },
      WC.el('span', { class: 'pick-label' }, '⚽ Meilleur buteur'),
      scorerInp,
    ),
    WC.el('label', { class: 'pick-field' },
      WC.el('span', { class: 'pick-label' }, '🎯 Meilleur passeur'),
      assistInp,
    ),
  );
  card.append(grid);
  card.append(WC.el('div', { class: 'flex-between', style: 'margin-top:14px;gap:12px' },
    WC.el('p', { class: 'muted', style: 'font-size:11px;margin:0;text-transform:uppercase;letter-spacing:0.06em' },
      deadline
        ? `Verrouillage le ${WC.fmtDate(deadline.toISOString())}`
        : 'Verrouillage à fixer'),
    saveBtn,
  ));
  card.append(status);

  slot.append(card);
})();

function renderPickRow(label, choice, points) {
  const chip = points > 0
    ? WC.el('span', { class: 'chip chip-green', style: 'margin-left:8px' }, `+${points} pts`)
    : (points === 0 && choice)
      ? WC.el('span', { class: 'chip chip-slate', style: 'margin-left:8px' }, 'En attente')
      : null;
  return WC.el('div', { class: 'pick-row' },
    WC.el('span', { class: 'pick-label' }, label),
    WC.el('span', { class: 'pick-value' }, choice || '— pas de prono —'),
    chip,
  );
}
