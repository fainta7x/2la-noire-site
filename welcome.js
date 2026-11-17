/* Common public data and analytics for the landing page. */
(() => {
  const bookingToken = /^#booking=([A-Za-z0-9_-]{43})$/.exec(location.hash)?.[1] || '';
  // Remove the private fragment before analytics and sign-in return URLs are initialized.
  if (bookingToken) history.replaceState(history.state, '', location.pathname + location.search + '#my-booking');
  window.addEventListener('hashchange', event => {
    const token = /^#booking=([A-Za-z0-9_-]{43})$/.exec(location.hash)?.[1];
    if (!token) return;
    event.stopImmediatePropagation();
    history.replaceState(history.state, '', location.pathname + location.search + '#my-booking');
    window.dispatchEvent(new CustomEvent('booking:access', { detail: { token } }));
  });
  document.documentElement.classList.add('js');
  const app = 'https://app.2lamafia.ru';
  const api = app + '/api/public/welcome';
  const request = async (path = '', options = {}) => {
    const response = await fetch(api + path, { cache: 'no-store', ...options });
    if (!response.ok) {
      const error = new Error('Не удалось загрузить данные клуба');
      error.status = response.status;
      throw error;
    }
    return response.json();
  };
  // Only these anonymous, published results may be saved or prefetched.
  // Sessions, dates, seats, applications and private booking links always use the API.
  const resultFields = { '/rating': 'players', '/history': 'evenings', '/seasons': 'seasons', '/tournaments': 'tournaments' };
  const cachePrefix = 'club_public_v1:';
  const maxAge = 2 * 60 * 1000;
  const records = new Map();
  const pending = new Map();
  const listeners = new Map();
  let initial = {};
  try { initial = JSON.parse(document.getElementById('club-public-data')?.textContent || '{}'); } catch {}
  const valid = (path, record) => record && Number.isFinite(record.savedAt) && record.savedAt > 0 &&
    record.savedAt <= Date.now() + 60000 && Array.isArray(record.data?.[resultFields[path]]);
  const cached = path => {
    if (records.has(path)) return records.get(path);
    let saved;
    try { saved = JSON.parse(localStorage.getItem(cachePrefix + path) || 'null'); } catch {}
    const seed = initial[path];
    const record = valid(path, saved) && (!valid(path, seed) || saved.savedAt >= seed.savedAt) ? saved : valid(path, seed) ? { ...seed, snapshot: true } : null;
    if (record) records.set(path, record);
    return record;
  };
  const refresh = path => {
    if (!Object.hasOwn(resultFields, path)) return request(path);
    if (pending.has(path)) return pending.get(path);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const promise = request(path, { signal: controller.signal }).then(data => {
      if (!Array.isArray(data?.[resultFields[path]])) throw new Error('Не удалось загрузить данные клуба');
      const record = { savedAt: Date.now(), data };
      records.set(path, record);
      try { localStorage.setItem(cachePrefix + path, JSON.stringify(record)); } catch {}
      listeners.get(path)?.forEach(listener => listener(data, record.savedAt));
      return data;
    }).finally(() => { clearTimeout(timeout); pending.delete(path); });
    pending.set(path, promise);
    return promise;
  };
  const read = (path = '', options = {}) => {
    if (!Object.hasOwn(resultFields, path) || Object.keys(options).length) return request(path, options);
    const record = cached(path);
    if (!record) return refresh(path);
    if (record.snapshot || Date.now() - record.savedAt >= maxAge) refresh(path).catch(() => {});
    return Promise.resolve(record.data);
  };
  const watch = (path, render, onError = () => {}) => {
    let previous;
    const deliver = (data, savedAt) => {
      const key = JSON.stringify(data) + ':' + savedAt;
      if (key === previous) return;
      previous = key;
      render(data, savedAt);
    };
    if (!listeners.has(path)) listeners.set(path, new Set());
    listeners.get(path).add(deliver);
    read(path).then(data => deliver(data, cached(path)?.savedAt)).catch(onError);
    return () => listeners.get(path).delete(deliver);
  };
  const resultsDate = savedAt => 'Данные на ' + new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
  }).format(new Date(savedAt));
  const destinations = {
    '/club/': ['/history', '/seasons', '/tournaments', '/rating'],
    '/rating/': ['/rating'], '/sezony/': ['/seasons'], '/turniry/': ['/tournaments'], '/klubnye-igry/': ['/history']
  };
  const connection = navigator.connection;
  const prefetchQueue = [];
  let prefetching = false;
  const prefetchNext = async () => {
    if (prefetching || !prefetchQueue.length) return;
    prefetching = true;
    const path = prefetchQueue.shift();
    try { await read(path); if (pending.has(path)) await pending.get(path); } catch {}
    prefetching = false;
    prefetchNext();
  };
  const prefetchLink = event => {
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '')) return;
    const link = event.target.closest('a');
    if (!link || link.origin !== location.origin || link.pathname === location.pathname) return;
    (destinations[link.pathname] || []).forEach(path => {
      if (!pending.has(path) && !prefetchQueue.includes(path)) prefetchQueue.push(path);
    });
    prefetchNext();
  };
  document.addEventListener('pointerover', prefetchLink, { passive: true });
  document.addEventListener('focusin', prefetchLink);
  document.addEventListener('touchstart', prefetchLink, { passive: true });
  const loadInfo = () => read().catch(async (error) => {
    if (error.status && error.status < 500) throw error;
    await new Promise((resolve) => setTimeout(resolve, 600));
    return read();
  });
  window.club = {
    bookingToken,
    app,
    api,
    read,
    watch,
    refresh,
    resultsDate,
    info: loadInfo().catch(() => null),
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
    if (link.origin === location.origin && link.pathname === '/igry/' && link.hash === '#join') window.goal('signup_click');
    if (link.classList.contains('account-login')) window.goal('login_click');
  });
})();
