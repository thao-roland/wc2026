(async function renderHeader() {
  const slot = document.getElementById('site-header');
  if (!slot) return;
  const user = await WC.currentUser().catch(() => null);
  const path = location.pathname;

  function navLink(href, label) {
    const active = path === href || path === href.replace('.html', '');
    return `<a href="${href}" class="${active ? 'active' : ''}">${label}</a>`;
  }

  slot.innerHTML = `
    <header class="site">
      <div class="row">
        <a class="brand" href="/">
          <span class="ball"></span>WC26<span class="b3">.bets</span>
        </a>
        <nav class="site">
          ${user ? navLink('/dashboard.html', 'Matchs') : ''}
          ${user ? navLink('/groups.html', 'Groupes') : ''}
        </nav>
        <div class="spacer"></div>
        ${user
          ? `<button id="sync-now" class="btn btn-ghost" style="padding:6px 10px;font-size:11px;margin-right:8px" title="Forcer le rafraîchissement des scores">⟳ Scores</button>
             <span class="user">${user.username}</span>
             <button id="logout" class="linkbtn">Déconnexion</button>`
          : `<a class="linkbtn" href="/login.html">Connexion</a>
             <a class="btn btn-primary" href="/register.html" style="margin-left:12px">S'inscrire</a>`}
      </div>
    </header>
  `;

  const logout = document.getElementById('logout');
  if (logout) {
    logout.addEventListener('click', async () => {
      await WC.sb.auth.signOut().catch(() => {});
      location.href = '/login.html';
    });
  }

  const sync = document.getElementById('sync-now');
  if (sync) {
    sync.addEventListener('click', () => {
      if (window.WC_SYNC && window.WC_SYNC.syncNowWithFeedback) {
        WC_SYNC.syncNowWithFeedback(sync);
      }
    });
  }
})();
