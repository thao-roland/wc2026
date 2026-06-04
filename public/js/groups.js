(async function () {
  const user = await WC.requireUser();
  if (!user) return;

  const list = document.getElementById('groups-list');
  const newName = document.getElementById('new-name');
  const joinCode = document.getElementById('join-code');
  const createBtn = document.getElementById('create-btn');
  const joinBtn = document.getElementById('join-btn');
  const msg = document.getElementById('msg');
  const err = document.getElementById('err');

  function setMsg(text, isError = false) {
    if (isError) { err.textContent = text; err.hidden = false; msg.hidden = true; }
    else         { msg.textContent = text; msg.hidden = false; err.hidden = true; }
  }

  joinCode.addEventListener('input', () => { joinCode.value = joinCode.value.toUpperCase(); });

  async function load() {
    list.innerHTML = '<p class="muted">Chargement…</p>';
    const { data, error } = await WC.sb
      .from('group_members')
      .select('status, groups!inner(id, name, invite_code, created_by)')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false });
    if (error) {
      list.innerHTML = `<p class="alert">${error.message}</p>`;
      return;
    }
    list.innerHTML = '';
    if (data.length === 0) {
      list.innerHTML = '<p class="muted">Tu n\'es dans aucun groupe pour l\'instant — crée ou rejoins-en un.</p>';
      return;
    }
    for (const row of data) {
      const g = row.groups;
      const right = row.status === 'pending'
        ? WC.el('span', { class: 'chip chip-slate' }, 'En attente')
        : WC.el('a', { class: 'btn btn-primary', href: `/group.html?id=${g.id}` }, 'Ouvrir');
      list.append(WC.el('div', { class: 'card flex-between' },
        WC.el('div', {},
          WC.el('h3', { style: 'margin:0 0 4px;font-size:17px;font-weight:800' }, g.name),
          WC.el('p', { class: 'muted', style: 'margin:0;font-size:12px' },
            'Code d\'invitation : ', WC.el('span', { class: 'mono' }, g.invite_code),
          ),
        ),
        right,
      ));
    }
  }

  createBtn.addEventListener('click', async () => {
    const name = newName.value.trim();
    if (name.length < 2) return setMsg('Le nom doit faire au moins 2 caractères', true);
    createBtn.disabled = true;
    try {
      const { data, error } = await WC.sb
        .from('groups')
        .insert({ name, created_by: user.id })
        .select('id, name, invite_code')
        .single();
      if (error) throw error;
      setMsg(`Créé — code d'invitation : ${data.invite_code}`);
      newName.value = '';
      load();
    } catch (ex) { setMsg(ex.message || 'Échec', true); }
    finally { createBtn.disabled = false; }
  });

  joinBtn.addEventListener('click', async () => {
    const code = joinCode.value.trim();
    if (!code) return;
    joinBtn.disabled = true;
    try {
      const { data, error } = await WC.sb.rpc('join_group_by_code', { p_code: code });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setMsg(row.my_status === 'active'
        ? `Tu es déjà dans « ${row.group_name} ».`
        : `Demande envoyée pour rejoindre « ${row.group_name} ». En attente du créateur.`);
      joinCode.value = '';
      load();
    } catch (ex) { setMsg(ex.message || 'Échec', true); }
    finally { joinBtn.disabled = false; }
  });

  load();
})();
