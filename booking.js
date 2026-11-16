/* Private booking access stays in a URL fragment and is sent only as a bearer token. */
(() => {
  const panel = document.getElementById('booking-management');
  const entry = document.getElementById('booking-management-link');
  if (!panel || !entry) return;
  const { api, info, organizer, bookingToken } = window.club;
  const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
  const readSaved = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  let access = readSaved('welcome_booking_access');
  let draft = readSaved('welcome_booking_draft');
  let token = bookingToken || access?.token || draft?.token || '';
  let current = null;
  let busy = false;
  let queuedToken = '';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const date = value => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'Europe/Moscow' }).format(new Date(value));
  const time = value => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }).format(new Date(value));
  const personalUrl = () => location.origin + '/igry/#booking=' + token;
  const enableEntry = () => { entry.hidden = !tokenPattern.test(token); };
  const accept = (value, contactHash) => {
    if (!tokenPattern.test(value)) return false;
    if (token !== value) { panel.hidden = true; current = null; }
    token = value;
    access = { token, ...(contactHash ? { contactHash } : {}) };
    save('welcome_booking_access', access);
    enableEntry();
    return true;
  };
  if (bookingToken) accept(bookingToken);
  enableEntry();

  const prepare = async payload => {
    const contact = payload.contact_kind + ':' + payload.contact_value.trim().toLowerCase();
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(contact)));
    const contactHash = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const previous = [access, draft].find(item => item?.contactHash === contactHash && tokenPattern.test(item.token));
    const value = previous?.token || btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    draft = { token: value, contactHash };
    save('welcome_booking_draft', draft);
    return draft;
  };
  const request = async payload => {
    const response = await fetch(api + '/booking', {
      method: payload ? 'POST' : 'GET', cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Не получилось загрузить запись. Попробуй ещё раз.');
    return data;
  };
  const feedback = (text, error = false) => {
    const output = panel.querySelector('.booking-manage-feedback');
    output.textContent = text;
    output.classList.toggle('is-error', error);
  };
  const copyLink = async button => {
    try {
      await navigator.clipboard.writeText(personalUrl());
      button.textContent = 'Ссылка скопирована';
    } catch {
      let field = panel.querySelector('.booking-private-link');
      if (!field) {
        field = document.createElement('input');
        field.className = 'booking-private-link';
        field.readOnly = true;
        field.setAttribute('aria-label', 'Персональная ссылка на запись');
        panel.append(field);
      }
      field.value = personalUrl();
      field.focus();
      field.select();
      feedback('Скопируй выделенную ссылку. Она открывает твою запись без входа.');
    }
  };
  const render = async data => {
    current = data;
    const choices = ((await info)?.evenings || []).filter(item => item.id !== data.evening?.id && Number.isFinite(new Date(item.starts_at).getTime()));
    const closed = data.evening && !['published', 'active'].includes(data.evening.status);
    const status = data.booked ? 'Запись подтверждена' : closed ? 'Запись на этот вечер закрыта' : data.evening ? 'Место пока не подтверждено' : 'Сейчас нет активной записи';
    panel.innerHTML = '<div class="booking-manage-heading"><p class="eyebrow">Твоя запись</p><button type="button" class="booking-manage-hide">Скрыть <span aria-hidden="true">↑</span></button></div>' +
      '<p class="booking-manage-status">' + escape(status) + '</p>' +
      '<h3 class="booking-manage-title" tabindex="-1">' + (data.evening ? escape(date(data.evening.starts_at)) + ' · ' + escape(time(data.evening.starts_at)) : 'Выбери следующий вечер') + '</h3>' +
      '<p class="booking-manage-details">' + escape(data.name) + (data.evening?.venue?.name ? ' · ' + escape(data.evening.venue.name) : '') + '</p>' +
      '<div class="booking-manage-actions">' +
        (data.can_change ? '<button type="button" class="primary-button" id="booking-change" aria-expanded="false" aria-controls="booking-change-form">' + (data.evening ? 'Перенести запись' : 'Выбрать вечер') + ' <span aria-hidden="true">→</span></button>' : '') +
        (data.can_cancel ? '<button type="button" class="booking-manage-secondary" id="booking-cancel" aria-expanded="false" aria-controls="booking-cancel-confirm">Отменить запись</button>' : '') +
        '<button type="button" class="booking-manage-secondary" id="booking-copy">Скопировать ссылку</button></div>' +
      (data.can_change ? '<form id="booking-change-form" class="booking-change-form" hidden><label for="booking-next-date">Другой вечер</label>' +
        (choices.length ? '<select id="booking-next-date" required>' + choices.map(item => '<option value="' + escape(item.id) + '">' + escape(date(item.starts_at)) + ' · ' + escape(time(item.starts_at)) + '</option>').join('') + '</select><button class="primary-button" type="submit">Подтвердить ' + (data.evening ? 'перенос' : 'запись') + '</button>' : '<p>Других дат пока нет. Можно <a href="' + organizer + '">написать организатору</a>.</p>') + '</form>' : '') +
      (data.can_cancel ? '<div id="booking-cancel-confirm" class="booking-cancel-confirm" hidden><p>Отменить запись на ' + escape(date(data.evening.starts_at)) + '?</p><div><button type="button" id="booking-cancel-yes">Да, отменить запись</button><button type="button" class="booking-manage-secondary" id="booking-cancel-no">Оставить запись</button></div></div>' : '') +
      '<p class="booking-manage-feedback" role="status"></p><p class="booking-manage-note">Сохрани ссылку, чтобы вернуться к этой записи с другого устройства.' + (!data.can_change ? ' Для изменения записи <a href="' + organizer + '">напиши организатору</a>.' : '') + '</p>';
    panel.querySelector('.booking-manage-hide').onclick = () => { panel.hidden = true; entry.focus(); };
    panel.querySelector('#booking-copy').onclick = event => copyLink(event.currentTarget);
    const change = panel.querySelector('#booking-change');
    const cancel = panel.querySelector('#booking-cancel');
    const changeForm = panel.querySelector('#booking-change-form');
    const confirmation = panel.querySelector('#booking-cancel-confirm');
    if (change) change.onclick = () => {
      changeForm.hidden = !changeForm.hidden;
      change.setAttribute('aria-expanded', String(!changeForm.hidden));
      if (confirmation) { confirmation.hidden = true; cancel.setAttribute('aria-expanded', 'false'); }
      if (!changeForm.hidden) changeForm.querySelector('select')?.focus();
    };
    if (cancel) cancel.onclick = () => {
      confirmation.hidden = !confirmation.hidden;
      cancel.setAttribute('aria-expanded', String(!confirmation.hidden));
      if (changeForm) { changeForm.hidden = true; change.setAttribute('aria-expanded', 'false'); }
      if (!confirmation.hidden) panel.querySelector('#booking-cancel-no').focus();
    };
    if (confirmation) {
      panel.querySelector('#booking-cancel-no').onclick = () => { confirmation.hidden = true; cancel.setAttribute('aria-expanded', 'false'); cancel.focus(); };
      panel.querySelector('#booking-cancel-yes').onclick = () => mutate({ action: 'cancel' });
    }
    if (changeForm) changeForm.onsubmit = event => { event.preventDefault(); mutate({ action: 'reschedule', evening_id: panel.querySelector('#booking-next-date').value }); };
  };
  const mutate = async payload => {
    if (busy) return;
    busy = true;
    const oldId = current?.evening?.id;
    panel.setAttribute('aria-busy', 'true');
    panel.querySelectorAll('button,select').forEach(item => { item.disabled = true; });
    feedback('Сохраняем…');
    try {
      const data = await request(payload);
      await render(data);
      window.dispatchEvent(new CustomEvent('booking:changed', { detail: data }));
      feedback(payload.action === 'cancel' ? 'Запись отменена.' : data.booked ? 'Запись подтверждена на выбранный вечер.' : 'Заявка сохранена. Место пока не подтверждено.');
      panel.querySelector('.booking-manage-title').focus();
      for (const id of new Set([oldId, data.evening?.id].filter(Boolean))) window.dispatchEvent(new CustomEvent('booking:submitted', { detail: { eveningId: id } }));
    } catch (error) { feedback(error.message || 'Не получилось сохранить. Попробуй ещё раз.', true); }
    finally { busy = false; panel.removeAttribute('aria-busy'); panel.querySelectorAll('button,select').forEach(item => { item.disabled = false; }); flushAccess(); }
  };
  const open = async () => {
    if (busy || !tokenPattern.test(token)) return;
    busy = true;
    panel.hidden = false;
    panel.setAttribute('aria-busy', 'true');
    panel.innerHTML = '<p role="status">Загружаем твою запись…</p>';
    panel.scrollIntoView({ block: 'start', behavior: 'instant' });
    try { await render(await request()); panel.querySelector('.booking-manage-title').focus(); }
    catch (error) {
      panel.innerHTML = '<h3 tabindex="-1">Не получилось открыть запись</h3><p role="alert">' + escape(error.message) + '</p><button class="booking-manage-secondary" type="button">Попробовать снова</button><a href="' + organizer + '">Написать организатору</a>';
      panel.querySelector('button').onclick = open;
      panel.querySelector('h3').focus();
    } finally { busy = false; panel.removeAttribute('aria-busy'); flushAccess(); }
  };
  function flushAccess() {
    if (!queuedToken || busy) return;
    const next = queuedToken;
    queuedToken = '';
    accept(next);
    open();
  }
  window.addEventListener('booking:access', event => {
    if (!tokenPattern.test(event.detail?.token)) return;
    queuedToken = event.detail.token;
    flushAccess();
  });
  window.addEventListener('hashchange', () => { if (location.hash === '#my-booking') open(); });
  entry.onclick = event => { event.preventDefault(); open(); };
  window.club.guestBooking = { prepare, accept, open, matches: value => value === token };
  info.then(data => {
    if (!data?.booking_management) return;
    const faq = document.getElementById('booking-changes-answer');
    if (faq) faq.innerHTML = 'После записи сохрани персональную ссылку: по ней можно отменить запись или выбрать другую дату без регистрации. На этом устройстве она также доступна по ссылке «Моя запись» над расписанием. Если ссылка потерялась, <a data-organizer-link href="' + organizer + '">напиши организатору</a>.';
  });
  if (bookingToken || location.hash === '#my-booking') open();
})();
