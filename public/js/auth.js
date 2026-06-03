function bind(formId, endpoint) {
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
      await WC.api(endpoint, { method: 'POST', body: data });
      location.href = '/dashboard';
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = formId === 'login-form' ? 'Sign in' : 'Create account';
    }
  });
}
bind('login-form', '/api/auth/login');
bind('register-form', '/api/auth/register');
