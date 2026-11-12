/* Sign-up block of the club's site: reads the nearest training and its seats from the club's app and sends the contact form to it. */
(() => {
  const API = (window.JOIN_API || 'https://2la-noire-chagina7x.waw0.amvera.tech') + '/api/public/welcome';
  const TELEGRAM = 'https://t.me/mafiatulasport';
  const POLL_MS = 10000;
  const root = document.getElementById('join-root');
  if (!root) return;
  const params = new URLSearchParams(location.search);
  const source = ['vk', 'telegram', 'friend'].includes(params.get('src')) ? params.get('src') : 'other';
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const part = (value, options) => new Intl.DateTimeFormat('ru-RU', Object.assign({ timeZone: 'Europe/Moscow' }, options)).format(new Date(value));
  const day = (value) => { const t = part(value, { weekday: 'long' }) + ', ' + part(value, { day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const clock = (value) => part(value, { hour: '2-digit', minute: '2-digit' });
  const left = (value) => {
    const ms = new Date(value).getTime() - Date.now();
    if (!(ms > 0)) return 'уже идёт';
    const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return d > 0 ? d + ' дн. ' + h + ' ч.' : h > 0 ? h + ' ч. ' + m + ' мин.' : m + ' мин.';
  };
  const PLACEHOLDER = { telegram: '@твой_ник', vk: 'vk.com/твоя_страница', phone: '+7 900 123-45-67' };
  const LABEL = { telegram: 'Твой ник в Telegram', vk: 'Ссылка на твою страницу ВК', phone: 'Твой номер телефона' };
  const CHANNEL = { telegram: 'в Telegram', vk: 'во ВКонтакте', phone: 'по телефону' };
  let page = null, seats = null, known = null, kind = 'telegram', done = null;

  const visitor = () => {
    try {
      let id = localStorage.getItem('welcome_visitor');
      if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48); localStorage.setItem('welcome_visitor', id); }
      return id;
    } catch (e) { return 'v' + Date.now() + Math.random().toString(16).slice(2, 10); }
  };

  const seatBoard = (fresh) => (seats.games || []).map((g) => {
    const free = Math.max(0, g.target - g.taken);
    const cells = Array.from({ length: Math.max(g.target, g.taken) }, (_, i) => g.people[i] || null);
    return '<div class="join-game"><div class="join-game-head"><strong>Игра ' + g.number + ' · ' + clock(g.starts_at) + '</strong><span class="' + (free === 0 ? 'is-full' : '') + '">' + (free === 0 ? 'Стол собран' : 'свободно ' + free + ' из ' + g.target) + '</span></div><ol class="join-seats">' +
      cells.map((n, i) => '<li class="join-seat' + (n ? ' is-taken' : '') + (n && fresh.has(n) ? ' is-new' : '') + '" aria-label="Место ' + (i + 1) + ': ' + (n ? esc(n) : 'свободно') + '"><b>' + (i + 1) + '</b>' + (n ? '<em>' + esc(n) + '</em>' : '<i>+</i>') + '</li>').join('') + '</ol></div>';
  }).join('');

  const form = () => done
    ? '<div class="join-done" data-testid="join-done"><strong>Спасибо!</strong><p>Мы напишем тебе ' + CHANNEL[done] + ' в течение дня.</p></div>'
    : '<form class="join-form" id="join-form" novalidate><label>Как тебя зовут<input type="text" id="join-name" maxlength="40" autocomplete="given-name"></label>' +
      '<div class="join-kinds" role="radiogroup" aria-label="Где тебе удобнее общаться">' + ['telegram', 'vk', 'phone'].map((k) => '<button type="button" role="radio" aria-checked="' + (kind === k) + '" data-kind="' + k + '">' + ({ telegram: 'Telegram', vk: 'ВКонтакте', phone: 'Телефон' })[k] + '</button>').join('') + '</div>' +
      '<label>' + LABEL[kind] + '<input type="' + (kind === 'phone' ? 'tel' : 'text') + '" id="join-contact" maxlength="120" placeholder="' + PLACEHOLDER[kind] + '"></label>' +
      '<label>Тебя кто-то пригласил? Напиши, кто<input type="text" id="join-friend" maxlength="60" value="' + esc(params.get('ref') || '') + '"></label>' +
      '<input class="join-trap" type="text" id="join-trap" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<p class="join-error" id="join-error" role="alert"></p>' +
      '<button class="primary-button" id="join-send" type="submit" disabled><span>Отправить заявку</span><span class="button-arrow">→</span></button></form>';

  let formDraft = { name: '', contact: '' };
  let news = '';
  // The seats are redrawn on their own, so a person typing in the form is never interrupted.
  const renderBoard = (fresh) => {
    const ev = page && page.evening;
    const slot = document.getElementById('join-board-slot');
    const sticky = document.getElementById('join-sticky');
    if (slot) slot.innerHTML = ev && seats && seats.games.length
      ? '<div class="join-board" data-testid="join-seats"><h3>Кто уже записался' + (seats.going > 0 ? ' · ' + seats.going : '') + '</h3>' + (seats.going === 0 ? '<p class="join-sub">Пока никого. Займи первое место.</p>' : '<p class="join-sub">Номера как на наших столах.</p>') + seatBoard(fresh || new Set()) + '<p class="join-news" role="status" aria-live="polite">' + esc(news) + '</p></div>' : '';
    if (sticky) {
      const free = seats ? (seats.games || []).reduce((s, g) => s + Math.max(0, g.target - g.taken), 0) : null;
      if (ev && !done) { sticky.innerHTML = '<div><strong>' + esc(day(ev.starts_at)) + '</strong><span>' + (free === null ? esc(ev.venue.name) : free > 0 ? 'Свободно мест: ' + free : 'Столы собраны, можно в резерв') + '</span></div><a href="#join-form">Занять место</a>'; sticky.classList.add('is-on'); document.body.classList.add('has-sticky'); }
      else { sticky.classList.remove('is-on'); document.body.classList.remove('has-sticky'); }
    }
  };
  const render = () => {
    const ev = page && page.evening;
    if (!page) { root.innerHTML = '<p class="join-empty">Загружаем ближайшее обучение…</p>'; return; }
    root.innerHTML =
      '<div class="join-layout"><div class="join-head">' +
        '<p class="eyebrow">Ближайшее обучение</p><h2>' + (ev ? esc(day(ev.starts_at)) : 'Скоро объявим дату') + '</h2>' +
        (ev ? '<p class="join-when" data-testid="join-countdown">через ' + left(ev.starts_at) + '</p>' +
          '<ul class="join-facts"><li><span>Время</span><strong>' + esc(ev.schedule || clock(ev.starts_at)) + '</strong></li><li><span>Место</span><div><strong>' + esc(ev.venue.name) + '</strong>' + (ev.venue.address ? '<br>' + esc(ev.venue.address) + (ev.venue.mapUrl ? ' · <a href="' + esc(ev.venue.mapUrl) + '" target="_blank" rel="noreferrer">как добраться</a>' : '') : '') + '</div></li><li><span>Цена</span><strong>' + esc(ev.price) + '</strong></li></ul>'
          : '<p class="join-sub" style="margin-top:22px">Дата ближайшего обучения пока не объявлена. Оставь контакт, и мы напишем, когда она появится.</p>') +
      '</div><div><div id="join-board-slot"></div>' +
        '<div class="join-form-card"><h3>' + (done ? 'Готово' : 'Хочешь прийти?') + '</h3>' + (done ? '' : '<p class="join-sub">Оставь имя и контакт. Мы напишем и запишем тебя.</p>') + form() +
        '<p class="join-alt">Или запишись сам: <a href="' + (ev && ev.telegram_url ? esc(ev.telegram_url) : TELEGRAM) + '">Telegram</a>' + (ev ? ' · <a href="' + esc(ev.join_url) + '">ВКонтакте</a>' : '') + '</p></div></div></div>';
    renderBoard(); bind();
  };

  const bind = () => {
    const f = document.getElementById('join-form');
    if (!f) return;
    const name = document.getElementById('join-name'), contact = document.getElementById('join-contact'), send = document.getElementById('join-send');
    name.value = formDraft.name; contact.value = formDraft.contact;
    const check = () => { formDraft = { name: name.value, contact: contact.value }; send.disabled = name.value.trim().length < 2 || !contact.value.trim(); };
    name.addEventListener('input', check); contact.addEventListener('input', check); check();
    f.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { kind = b.dataset.kind; formDraft.contact = ''; render(); }));
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); if (send.disabled) return;
      send.disabled = true; document.getElementById('join-error').textContent = '';
      try {
        const r = await fetch(API + '/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.value, contact_kind: kind, contact_value: contact.value, source, referred_by: document.getElementById('join-friend').value, website: document.getElementById('join-trap').value }) });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || 'Не удалось отправить. Попробуй ещё раз или напиши нам в Telegram.');
        done = kind; render();
      } catch (err) { document.getElementById('join-error').textContent = err.message || 'Не удалось отправить'; check(); }
    });
  };

  const loadSeats = async () => {
    try {
      const r = await fetch(API + '/seats', { cache: 'no-store' });
      if (!r.ok) return;
      const next = await r.json();
      const names = new Set((next.games || []).flatMap((g) => g.people));
      let fresh = new Set();
      if (known) { const added = [...names].filter((n) => !known.has(n)); if (added.length) { fresh = new Set(added); news = 'Новая запись: ' + added.join(', '); setTimeout(() => { news = ''; const el = document.querySelector('.join-news'); if (el) el.textContent = ''; document.querySelectorAll('.join-seat.is-new').forEach((x) => x.classList.remove('is-new')); }, 6000); } }
      known = names; seats = next;
      renderBoard(fresh);
    } catch (e) { /* the board keeps the last picture */ }
  };

  fetch(API, { cache: 'no-store' }).then((r) => r.ok ? r.json() : Promise.reject(new Error('load'))).then((data) => { page = data; render(); loadSeats(); })
    .catch(() => { root.innerHTML = '<p class="join-empty">Не получилось загрузить ближайшее обучение. Запишись в <a href="' + TELEGRAM + '" style="color:var(--blue)">Telegram</a>.</p>'; });
  fetch(API + '/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor_id: visitor(), source }) }).catch(() => {});
  setInterval(() => { if (document.visibilityState !== 'hidden') loadSeats(); const c = document.querySelector('[data-testid="join-countdown"]'); if (c && page && page.evening) c.textContent = 'через ' + left(page.evening.starts_at); }, POLL_MS);
})();
