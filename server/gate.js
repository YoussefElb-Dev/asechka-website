function escapeHtml(text) {
  return text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
export function gatePage(mode = 'login', error = '') {
  const welcome = mode === 'welcome';
  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive">
  <title>${welcome ? 'Welcome back, Asechka' : 'A little door, just for you'}</title>
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&family=Caveat:wght@500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/gate.css"><script defer src="/gate.js"></script>
</head><body class="${welcome ? 'welcome-page' : ''}">
  <div class="gate-stars" aria-hidden="true"><span>✧</span><span>✦</span><span>✧</span><span>·</span><span>✦</span></div>
  <a class="gate-brand" href="/">✦ <span>asechka.</span></a>
  <main class="gate-wrap"><section class="gate-card" aria-labelledby="gate-title">
    <div class="gate-mark" aria-hidden="true">${welcome ? '♡' : '<svg viewBox="0 0 40 40" fill="none"><rect x="9" y="17" width="22" height="19" rx="7" stroke="currentColor" stroke-width="1.7"/><path d="M14 17v-5a6 6 0 0 1 12 0v5" stroke="currentColor" stroke-width="1.7"/><circle cx="20" cy="25" r="2" fill="currentColor"/><path d="M20 27v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'}</div>
    <p class="gate-eyebrow">${welcome ? 'THERE’S MY FAVORITE PERSON' : 'A LITTLE CORNER OF THE WORLD'}</p>
    <h1 id="gate-title">${welcome ? 'Welcome back,<br><span lang="ru">моя радость.</span>' : 'A little door.<br><span>Only for you.</span>'}</h1>
    <p class="gate-description">${welcome ? '<span lang="ru">С возвращением, Асечка ♡</span><br>My joy. My Asechka. Come make yourself at home.' : 'Some things are just between us.<br>You know the little code, love.'}</p>
    ${welcome ? '<a class="gate-submit" href="/">Come on in <span aria-hidden="true">↗</span></a>' : `<form id="gate-form" action="/api/session" method="post">
      <label for="password">Our little code</label>
      <div class="password-wrap"><input id="password" name="password" type="password" inputmode="numeric" autocomplete="current-password" placeholder="····" required maxlength="64" aria-describedby="gate-error" ${error ? 'aria-invalid="true"' : ''}><button class="show-password" type="button" aria-label="Show password" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/></svg></button></div>
      <p id="gate-error" role="alert">${escapeHtml(error)}</p>
      <button class="gate-submit" type="submit">Let me in <span aria-hidden="true">↗</span></button>
    </form>`}
    <p class="gate-note">${welcome ? 'you were always meant to be here ♡' : 'a small secret, a whole lot of love ♡'}</p>
  </section></main>
  <footer class="gate-footer">Made with love. Kept just for you.</footer>
</body></html>`;
}
