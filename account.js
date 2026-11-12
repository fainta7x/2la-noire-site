/* Вход на сайте: узнаём у приложения, кто пришёл, и показываем «Войти» или «Привет, ник». Работает, когда сайт и приложение на одном домене. */
(() => {
  const APP = window.JOIN_API || 'https://2la-noire-chagina7x.waw0.amvera.tech';
  const header = document.querySelector('.site-header');
  if (!header) return;
  const box = document.createElement('div');
  box.className = 'account';
  box.id = 'account';
  header.appendChild(box);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safe = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? esc(u) : '#');
  const login = APP + '/player?return=' + encodeURIComponent(location.origin + '/');
  const guest = (url) => { box.innerHTML = '<a class="account-login" href="' + safe(url || login) + '">Войти</a>'; };
  guest(login);
  fetch(APP + '/api/public/welcome/session', { credentials: 'include', cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
    .then((d) => {
      document.documentElement.dataset.signedIn = d.signed_in ? '1' : '0';
      if (!d.signed_in) { guest(d.login_url); return; }
      box.innerHTML = '<span class="account-hello">Привет, ' + esc(d.nickname) + '</span><a href="' + safe(d.cabinet_url) + '">Мой кабинет</a>' + (d.crm_url ? '<a href="' + safe(d.crm_url) + '">CRM</a>' : '');
      window.dispatchEvent(new CustomEvent('club:signed-in', { detail: { nickname: d.nickname, organizer: Boolean(d.organizer) } }));
    })
    .catch(() => {});
})();
