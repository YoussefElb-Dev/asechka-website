const form = document.querySelector('#gate-form');
const password = document.querySelector('#password');
const toggle = document.querySelector('.show-password');
toggle?.addEventListener('click', () => {
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  toggle.setAttribute('aria-pressed', String(show));
  toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});
form?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('[type=submit]');
  const error = document.querySelector('#gate-error');
  button.disabled = true;
  button.textContent = 'Opening our little door…';
  error.textContent = '';
  password.removeAttribute('aria-invalid');
  try {
    const response = await fetch('/api/session', {
      method: 'POST', credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password: password.value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Our little door needs a moment. Please try again.');
    password.value = '';
    window.location.assign('/welcome');
  } catch (issue) {
    error.textContent = issue.message === 'Failed to fetch' ? 'Couldn’t reach our little door. Check your connection and try again.' : issue.message;
    password.setAttribute('aria-invalid', 'true');
    password.focus();
    button.disabled = false;
    button.innerHTML = 'Let me in <span aria-hidden="true">↗</span>';
  }
});
