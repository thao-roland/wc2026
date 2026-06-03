// Maps the friendly username form to Supabase email/password auth.

function usernameValid(u) {
  return /^[a-z0-9_-]{3,32}$/.test(u);
}

async function doLogin(username, password) {
  const email = WC.emailFor(username);
  const { error } = await WC.sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

async function doRegister(username, password) {
  const u = username.trim().toLowerCase();
  if (!usernameValid(u)) throw new Error('Username: 3-32 chars, a-z 0-9 _ -');
  if (password.length < 6) throw new Error('Password ≥ 6 chars');

  const email = WC.emailFor(u);
  const { data, error } = await WC.sb.auth.signUp({
    email,
    password,
    options: { data: { username: u } },
  });
  if (error) {
    // Friendlier message for "user already registered"
    if (/registered|exists/i.test(error.message)) {
      throw new Error('Username taken');
    }
    throw error;
  }

  // If email confirmation is OFF in Supabase, signUp gives us a session.
  // If it's ON, sign the user in directly so they can keep using the app
  // (they're using a fake-domain email anyway).
  if (!data.session) {
    const { error: signInErr } = await WC.sb.auth.signInWithPassword({ email, password });
    if (signInErr) throw signInErr;
  }
}

function bind(formId, handler, doneLabel) {
  const form = document.getElementById(formId);
  if (!form) return;
  const err = document.getElementById('err');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const data = Object.fromEntries(new FormData(form));
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = '…';
    try {
      await handler(data.username, data.password);
      location.href = '/dashboard';
    } catch (ex) {
      err.textContent = ex.message || 'Something went wrong';
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = doneLabel;
    }
  });
}

bind('login-form',    (u, p) => doLogin(u, p),    'Sign in');
bind('register-form', (u, p) => doRegister(u, p), 'Create account');
