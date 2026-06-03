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
    if (isError) {
      err.textContent = text; err.hidden = false; msg.hidden = true;
    } else {
      msg.textContent = text; msg.hidden = false; err.hidden = true;
    }
  }

  joinCode.addEventListener('input', () => { joinCode.value = joinCode.value.toUpperCase(); });

  async function load() {
    list.innerHTML = '<p class="muted">Loading…</p>';
    const { groups } = await WC.api('/api/groups');
    list.innerHTML = '';
    if (groups.length === 0) {
      list.innerHTML = '<p class="muted">You\'re not in any groups yet — create or join one.</p>';
      return;
    }
    for (const g of groups) {
      const right = g.my_status === 'pending'
        ? WC.el('span', { class: 'chip chip-slate' }, 'Pending approval')
        : WC.el('a', { class: 'btn btn-primary', href: `/group?id=${g.id}` }, 'Open');
      list.append(WC.el('div', { class: 'card flex-between' },
        WC.el('div', {},
          WC.el('h3', { style: 'margin:0 0 4px;font-size:17px;font-weight:800' }, g.name),
          WC.el('p', { class: 'muted', style: 'margin:0;font-size:12px' },
            'Invite: ', WC.el('span', { class: 'mono' }, g.invite_code)),
        ),
        right,
      ));
    }
  }

  createBtn.addEventListener('click', async () => {
    const name = newName.value.trim();
    if (!name) return;
    createBtn.disabled = true;
    try {
      const { group } = await WC.api('/api/groups', { method: 'POST', body: { name } });
      setMsg(`Created — invite code: ${group.invite_code}`);
      newName.value = '';
      load();
    } catch (ex) { setMsg(ex.message, true); }
    finally { createBtn.disabled = false; }
  });

  joinBtn.addEventListener('click', async () => {
    const code = joinCode.value.trim();
    if (!code) return;
    joinBtn.disabled = true;
    try {
      const { group, status } = await WC.api('/api/groups/join', { method: 'POST', body: { invite_code: code } });
      setMsg(status === 'active'
        ? `You're already in "${group.name}".`
        : `Requested to join "${group.name}". Waiting for the owner.`);
      joinCode.value = '';
      load();
    } catch (ex) { setMsg(ex.message, true); }
    finally { joinBtn.disabled = false; }
  });

  load();
})();
