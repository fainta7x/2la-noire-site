/* Common public data and analytics for the landing page. */
(() => {
  document.documentElement.classList.add('js');
  const app = 'https://app.2lamafia.ru';
  const api = app + '/api/public/welcome';
  const read = async (path = '', options = {}) => {
    const response = await fetch(api + path, { cache: 'no-store', ...options });
    if (!response.ok) throw new Error('Не удалось загрузить данные клуба');
    return response.json();
  };
  window.club = {
    app,
    api,
    read,
    info: read().catch(() => null),
    organizer: 'https://t.me/Chagina7x',
    telegram: 'https://t.me/mafiatulasport',
    safeLink(value, origin) {
      if (typeof value !== 'string' || !value.trim()) return '';
      try {
        const url = new URL(value, origin);
        return url.protocol === 'https:' && (!origin || url.origin === origin) ? url.href : '';
      } catch {
        return '';
      }
    }
  };

  const counter = 114214096;
  window.ym = window.ym || function () {
    (window.ym.a = window.ym.a || []).push(arguments);
  };
  window.ym.l = Date.now();
  const tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://mc.yandex.ru/metrika/tag.js?id=' + counter;
  document.head.append(tag);
  window.ym(counter, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false });
  window.goal = (name) => window.ym(counter, 'reachGoal', name);
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link) return;
    if (['#join', '#join-form'].includes(link.getAttribute('href'))) window.goal('signup_click');
    if (link.classList.contains('account-login')) window.goal('login_click');
  });
})();
