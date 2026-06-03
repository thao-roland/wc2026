(async function renderHeader() {
  const slot = document.getElementById('site-header');
  if (!slot) return;
  const user = await WC.currentUser().catch(() => null);
  const path = location.pathname;

  function navLink(href, label) {
    return `<a href="${href}" class="${path.startsWith(href) ? 'active' : ''}">${label}</a>`;
  }

  slot.innerHTML = `
    <header class="site">
      <div class="row">
        <a class="brand" href="/">
          <span class="b1">⚽</span><span class="b2">WC26</span><span class="b3">.bets</span>
        </a>
        <nav class="site">
          ${user ? navLink('/dashboard', 'Matches') : ''}
          ${user ? navLink('/groups', 'Groups') : ''}
          ${user ? navLink('/admin', 'Admin') : ''}
        </nav>
        <div class="spacer"></div>
        ${user
          ? `<span class="user">@${user.username}</span>
             <button id="logout" class="linkbtn">Logout</button>`
          : `<a class="linkbtn" href="/login">Login</a>
             <a class="btn btn-primary" href="/register" style="margin-left:10px">Sign up</a>`}
      </div>
    </header>
  `;

  const logout = document.getElementById('logout');
  if (logout) {
    logout.addEventListener('click', async () => {
      await WC.sb.auth.signOut().catch(() => {});
      location.href = '/login';
    });
  }
})();
