// Initializes the Supabase client and exposes a few helpers on window.WC.
// Must be loaded after config.js and the supabase-js UMD bundle.
(function () {
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    console.error('Supabase not configured — edit /js/config.js');
    return;
  }
  const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  window.sb = sb;

  // Cached profile lookup for the current user.
  let _profile = null;
  async function loadProfile(uid) {
    if (_profile && _profile.id === uid) return _profile;
    const { data, error } = await sb.from('profiles').select('id, username').eq('id', uid).single();
    if (error) throw error;
    _profile = data;
    return data;
  }

  async function currentUser() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    try {
      const profile = await loadProfile(user.id);
      return { id: user.id, username: profile.username, email: user.email };
    } catch {
      return { id: user.id, username: user.email?.split('@')[0] || 'unknown', email: user.email };
    }
  }

  async function requireUser(redirectTo = '/login') {
    const u = await currentUser();
    if (!u) { location.href = redirectTo; return null; }
    return u;
  }

  function emailFor(username) {
    return `${username.trim().toLowerCase()}@${window.WC26_EMAIL_DOMAIN}`;
  }

  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return e;
  }

  function fmtDate(iso) {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function qs(name) {
    return new URLSearchParams(location.search).get(name);
  }

  window.WC = { sb, currentUser, requireUser, emailFor, el, fmtDate, qs };
})();
