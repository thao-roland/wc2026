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
          ? `<button id="sync-now" class="btn btn-ghost" title="Forcer le rafraîchissement des scores">⟳ <span class="label">Scores</span></button>
             <span id="sync-status" class="sync-status" title="Dernière tentative de sync"></span>
             <span class="user">${user.username}</span>
             <button id="logout" class="linkbtn"><span class="lbl-full">Déconnexion</span><span class="lbl-short">Déco</span></button>`
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

  // Indicateur "il y a Xs" mis à jour à chaque tick de sync et toutes
  // les 5s pour montrer que ça vit.
  const statusEl = document.getElementById('sync-status');
  if (statusEl) {
    function refreshStatus() {
      const ts = window.__wc26_last_sync;
      if (!ts) { statusEl.textContent = 'jamais sync.'; statusEl.style.color = ''; return; }
      const secs = Math.floor((Date.now() - ts) / 1000);
      let txt;
      if      (secs < 5)   txt = '✓ à jour';
      else if (secs < 60)  txt = `il y a ${secs}s`;
      else if (secs < 3600) txt = `il y a ${Math.floor(secs / 60)} min`;
      else                 txt = `il y a ${Math.floor(secs / 3600)}h`;
      statusEl.textContent = txt;
      statusEl.style.color = secs < 120 ? 'var(--pitch)' : 'var(--whistle)';
    }
    setInterval(refreshStatus, 5000);
    window.addEventListener('wc26:sync-attempt', refreshStatus);
    refreshStatus();
  }
})();
