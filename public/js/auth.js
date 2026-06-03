async function doLogin(email, password) {
  const { error } = await WC.sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw error;
}

async function doRegister(email, password) {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Invalid email');
  if (password.length < 6) throw new Error('Password ≥ 6 chars');

  const { data, error } = await WC.sb.auth.signUp({ email: e, password });
  if (error) {
    if (/registered|exists/i.test(error.message)) throw new Error('Email already registered');
    throw error;
  }
  if (!data.session) {
    const { error: signInErr } = await WC.sb.auth.signInWithPassword({ email: e, password });
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
      await handler(data.email, data.password);
      location.href = '/dashboard.html';
    } catch (ex) {
      err.textContent = ex.message || 'Something went wrong';
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = doneLabel;
    }
  });
}

bind('login-form',    (e, p) => doLogin(e, p),    'Sign in');
bind('register-form', (e, p) => doRegister(e, p), 'Create account');
