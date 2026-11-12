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
  // Номер всегда начинается с +7: цифры подставляются в маску +7 (900) 123-45-67, ведущие 7 и 8 не дублируются.
  const maskPhone = (raw) => { let d = String(raw || '').replace(/\D/g, ''); if (d[0] === '7' || d[0] === '8') d = d.slice(1); if (d[0] === '8' || d[0] === '7') d = d.slice(1); d = d.slice(0, 10); let out = '+7'; if (d.length) out += ' (' + d.slice(0, 3); if (d.length >= 3) out += ')'; if (d.length > 3) out += ' ' + d.slice(3, 6); if (d.length > 6) out += '-' + d.slice(6, 8); if (d.length > 8) out += '-' + d.slice(8, 10); return out; };
  const PLACEHOLDER = { telegram: '@твой_ник', vk: 'vk.com/твоя_страница', phone: '+7 (900) 123-45-67' };
  const LABEL = { telegram: 'Твой ник в Telegram', vk: 'Ссылка на твою страницу ВК', phone: 'Твой номер телефона' };
  const CHANNEL = { telegram: 'Напишем тебе в Telegram', vk: 'Напишем тебе во ВКонтакте', phone: 'Позвоним или напишем тебе на этот номер' };
  let page = null, seats = null, known = null, kind = 'telegram', done = null, chosen = null, doneDay = '', doneBooked = false, doneKept = false;
  // The evening the person looks at: the one picked in the list, otherwise the nearest.
  const current = () => { const list = (page && page.evenings) || []; return list.find((e) => e.id === chosen) || (page && page.evening) || list[0] || null; };

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
    ? '<div class="join-done" data-testid="join-done"><strong>' + (doneKept ? 'Ты уже записан на другую пятницу' : doneBooked ? 'Место за тобой' : 'Заявку приняли') + (doneDay && !doneKept ? ': ' + esc(doneDay) : '') + '</strong><p>' + (doneKept ? 'Чтобы перенести место на другой вечер, просто напиши нам, мы поменяем.' : CHANNEL[done] + ' в течение дня и подтвердим. Если планы поменяются, просто ответь нам.') + '</p></div>'
    : '<form class="join-form" id="join-form" novalidate><label>Как тебя зовут<input type="text" id="join-name" maxlength="40" autocomplete="given-name"></label>' +
      '<div class="join-kinds" role="radiogroup" aria-label="Где тебе удобнее общаться">' + ['telegram', 'vk', 'phone'].map((k) => '<button type="button" role="radio" aria-checked="' + (kind === k) + '" data-kind="' + k + '">' + ({ telegram: 'Telegram', vk: 'ВКонтакте', phone: 'Телефон' })[k] + '</button>').join('') + '</div>' +
      '<label>' + LABEL[kind] + '<input type="' + (kind === 'phone' ? 'tel' : 'text') + '" id="join-contact" maxlength="120" placeholder="' + PLACEHOLDER[kind] + '"></label>' +
      '<details class="join-ref"' + (params.get('ref') ? ' open' : '') + '><summary>Тебя пригласил друг?</summary><label>Как его зовут<input type="text" id="join-friend" maxlength="60" value="' + esc(params.get('ref') || '') + '"></label></details>' +
      '<input class="join-trap" type="text" id="join-trap" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<p class="join-error" id="join-error" role="alert"></p>' +
      '<button class="primary-button" id="join-send" type="submit" disabled><span>Записаться</span><span class="button-arrow">→</span></button></form>';

  let formDraft = { name: '', contact: '' };
  let news = '';
  // The seats are redrawn on their own, so a person typing in the form is never interrupted.
  const renderBoard = (fresh) => {
    const ev = current();
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
  const picker = (ev) => { const list = page.evenings || []; return list.length > 1 ? '<div class="join-days" role="radiogroup" aria-label="Выбери пятницу">' + list.map((e) => '<button type="button" role="radio" data-evening="' + esc(e.id) + '" aria-checked="' + (ev && ev.id === e.id) + '">' + esc(day(e.starts_at)) + '</button>').join('') + '</div>' : ''; };
  const render = () => {
    const ev = current();
    if (!page) { root.innerHTML = '<p class="join-empty">Загружаем ближайшее обучение…</p>'; return; }
    root.innerHTML =
      '<div class="join-layout"><div class="join-head">' +
        '<p class="eyebrow">' + ((page.evenings || []).length > 1 ? 'Когда придёшь?' : 'Ближайшая игра') + '</p>' + picker(ev) + '<h2>' + (ev ? esc(day(ev.starts_at)) : 'Скоро объявим дату') + '</h2>' +
        (ev ? '<p class="join-when" data-testid="join-countdown">через ' + left(ev.starts_at) + '</p>' +
          '<ul class="join-facts"><li><span>Время</span><strong>' + esc(ev.schedule || clock(ev.starts_at)) + '</strong></li><li><span>Место</span><div><strong>' + esc(ev.venue.name) + '</strong>' + (ev.venue.address ? '<br>' + esc(ev.venue.address) + (ev.venue.mapUrl ? ' · <a href="' + esc(ev.venue.mapUrl) + '" target="_blank" rel="noreferrer">как добраться</a>' : '') : '') + '</div></li><li><span>Цена</span><strong>' + esc(String(ev.price || '').split(/[,—]/)[0].trim() || 'Первые 2 вечера бесплатно') + '</strong></li></ul>'
          : '<p class="join-sub" style="margin-top:22px">Дата ближайшего обучения пока не объявлена. Оставь контакт, и мы напишем, когда она появится.</p>') +
      '</div><div>' +
        '<div class="join-form-card"><h3>' + (done ? 'Готово' : 'Записаться на игру') + '</h3>' + (done ? '' : '<p class="join-sub">Оставь имя и контакт, и место закрепится за тобой.</p>') + form() +
        '</div><div id="join-board-slot" class="join-board-gap"></div></div></div>';
    renderBoard(); bind();
  };

  const bind = () => {
    document.querySelectorAll('[data-evening]').forEach((b) => b.addEventListener('click', () => { chosen = b.dataset.evening; seats = null; known = null; render(); loadSeats(); }));
    const f = document.getElementById('join-form');
    if (!f) return;
    const name = document.getElementById('join-name'), contact = document.getElementById('join-contact'), send = document.getElementById('join-send');
    name.value = formDraft.name; contact.value = formDraft.contact;
    const check = () => { formDraft = { name: name.value, contact: contact.value }; const okContact = kind === 'phone' ? contact.value.replace(/\D/g, '').length === 11 : Boolean(contact.value.trim()); send.disabled = name.value.trim().length < 2 || !okContact; };
    if (kind === 'phone') { contact.addEventListener('focus', () => { if (!contact.value) { contact.value = '+7'; formDraft.contact = '+7'; } }); contact.addEventListener('input', () => { contact.value = maskPhone(contact.value); }); contact.addEventListener('blur', () => { if (contact.value === '+7') { contact.value = ''; check(); } }); }
    name.addEventListener('input', check); contact.addEventListener('input', check); check();
    f.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { kind = b.dataset.kind; formDraft.contact = ''; render(); }));
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); if (send.disabled) return;
      send.disabled = true; document.getElementById('join-error').textContent = '';
      try {
        const r = await fetch(API + '/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.value, contact_kind: kind, contact_value: contact.value, source, evening_id: (current() || {}).id || '', referred_by: document.getElementById('join-friend').value, website: document.getElementById('join-trap').value }) });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || 'Не удалось отправить. Попробуй ещё раз или напиши нам в Telegram.');
        if (window.goal) window.goal('lead_sent'); done = kind; doneBooked = body.booked === true; doneKept = body.already_booked === true && body.booked !== true; doneDay = current() ? day(current().starts_at) : ''; render(); loadSeats();
      } catch (err) { document.getElementById('join-error').textContent = err.message || 'Не удалось отправить'; check(); }
    });
  };

  const loadSeats = async () => {
    try {
      const cur = current();
      const r = await fetch(API + '/seats' + (cur ? '?evening=' + encodeURIComponent(cur.id) : ''), { cache: 'no-store' });
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
  setInterval(() => { if (document.visibilityState !== 'hidden') loadSeats(); const c = document.querySelector('[data-testid="join-countdown"]'); if (c && current()) c.textContent = 'через ' + left(current().starts_at); }, POLL_MS);
})();
