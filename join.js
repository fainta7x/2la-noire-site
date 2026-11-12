(() => {
  const root = document.getElementById('join-root');
  if (!root) return;
  const { api, read, info, organizer, telegram, safeLink } = window.club;
  const params = new URLSearchParams(location.search);
  const allowedSources = ['vk', 'telegram', 'friend'];
  const source = allowedSources.includes(params.get('src')) ? params.get('src') : 'other';
  const dateFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
  const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
  const day = (value) => {
    const text = dateFormat.format(new Date(value));
    return text[0].toUpperCase() + text.slice(1);
  };
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const contacts = {
    telegram: { title: 'Telegram', label: 'Имя пользователя в Telegram', example: '@username' },
    vk: { title: 'ВКонтакте', label: 'Ссылка на страницу ВКонтакте', example: 'vk.com/username' },
    phone: { title: 'Телефон', label: 'Номер телефона', example: '+7 (900) 123-45-67' }
  };

  const radio = (name, value, text, checked) =>
    '<label><input type="radio" name="' + name + '" value="' + escape(value) + '"' + (checked ? ' checked' : '') + '><span>' + escape(text) + '</span></label>';

  const createVisitorId = () => {
    try {
      let id = localStorage.getItem('welcome_visitor');
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('welcome_visitor', id);
      }
      return id;
    } catch {
      return 'v' + Date.now() + Math.random().toString(16).slice(2, 10);
    }
  };
  fetch(api + '/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor_id: createVisitorId(), source }) }).catch(() => {});

  const mount = (data) => {
    const evenings = data.evenings?.length ? data.evenings : data.evening ? [data.evening] : [];
    const contactOrganizer = safeLink(data.contacts?.find((entry) => entry.label === 'Telegram')?.url) || organizer;
    let selected = evenings.find((event) => event.id === data.evening?.id) || evenings[0] || null;
    let pendingSeats = null;
    let contactKind = 'telegram';
    const contactDrafts = {};

    root.innerHTML =
      '<div class="join-layout">' +
        '<div class="join-head">' +
          (evenings.length > 1 ? '<fieldset class="join-days"><legend>Выбери дату</legend><div class="join-options">' +
            evenings.map((event) => radio('evening', event.id, day(event.starts_at), event.id === selected.id)).join('') + '</div></fieldset>' : '') +
          '<div id="join-evening" aria-live="polite"></div>' +
        '</div>' +
        '<div class="join-form-card">' +
          '<h3 id="join-form-heading">' + (selected ? 'Запись на игру' : 'Узнать о следующей игре') + '</h3>' +
          '<p class="join-sub" id="join-instructions">' + (selected ? 'Напиши своё имя и как с тобой связаться.' : 'Напишем, когда появится дата.') + '</p>' +
          '<form class="join-form" id="join-form">' +
            '<label class="join-field">Имя<input id="join-name" type="text" required minlength="2" maxlength="40" autocomplete="given-name"></label>' +
            '<fieldset class="join-kinds"><legend>Где с тобой связаться?</legend><div class="join-options">' +
              Object.entries(contacts).map(([kind, contact]) => radio('contact-kind', kind, contact.title, kind === contactKind)).join('') +
            '</div></fieldset>' +
            '<label class="join-field"><span id="join-contact-label"></span><input id="join-contact" required maxlength="120" autocapitalize="none" spellcheck="false"></label>' +
            '<label class="join-field">Кто пригласил? (необязательно)<input type="text" id="join-friend" maxlength="60" value="' + escape(params.get('ref') || '') + '"></label>' +
            '<input class="join-trap" type="text" id="join-trap" tabindex="-1" autocomplete="off" aria-hidden="true">' +
            '<p class="join-note">Контакт нужен для связи по этой записи.</p>' +
            '<p class="join-error" id="join-error" role="alert"></p>' +
            '<button class="primary-button" type="submit">' + (selected ? 'Записаться на игру' : 'Сообщить мне о дате') + '</button>' +
          '</form>' +
          '<div class="join-done" id="join-result" role="status" tabindex="-1" hidden></div>' +
          '<p class="join-alt" id="join-alt"></p>' +
        '</div>' +
        '<details class="join-board" hidden><summary id="join-seats-label">Места за столом</summary><div class="join-games"></div></details>' +
      '</div>';

    const form = root.querySelector('form');
    const submit = form.querySelector('button');
    const submitLabel = submit.textContent;
    const name = root.querySelector('#join-name');
    const field = root.querySelector('#join-contact');
    const error = root.querySelector('#join-error');
    const result = root.querySelector('#join-result');
    const board = root.querySelector('.join-board');
    const games = board.querySelector('.join-games');
    const boardLabel = root.querySelector('#join-seats-label');
    const datePicker = root.querySelector('.join-days');

    const setContactField = () => {
      const contact = contacts[contactKind];
      root.querySelector('#join-contact-label').textContent = contact.label;
      field.type = contactKind === 'phone' ? 'tel' : 'text';
      field.autocomplete = contactKind === 'phone' ? 'tel' : 'off';
      field.placeholder = contact.example;
      field.value = contactDrafts[contactKind] || '';
      field.setCustomValidity('');
    };
    setContactField();

    const updateEvening = () => {
      const event = selected;
      const details = root.querySelector('#join-evening');
      const alt = root.querySelector('#join-alt');
      if (!event) {
        details.innerHTML = '<h3 class="join-heading">Пока нет даты следующей игры</h3>';
        alt.innerHTML = '<a href="' + escape(contactOrganizer) + '">Написать организатору</a>';
        return;
      }
      const venue = event.venue || {};
      const map = safeLink(venue.mapUrl);
      details.innerHTML = '<h3 class="join-heading">' + escape(day(event.starts_at)) + '</h3>' +
        '<dl class="join-facts"><div><dt>Время</dt><dd>' + escape(event.schedule || timeFormat.format(new Date(event.starts_at))) + '</dd></div>' +
        '<div><dt>Место</dt><dd>' + escape(venue.name || '') + (venue.address ? '<br>' + escape(venue.address) : '') +
        (map ? '<br><a href="' + escape(map) + '">Открыть карту</a>' : '') + '</dd></div>' +
        '<div><dt>Цена</dt><dd>Первые два вечера бесплатно</dd></div></dl>';
      const telegramUrl = safeLink(event.telegram_url);
      const vkUrl = safeLink(event.join_url);
      const options = [telegramUrl && '<a href="' + escape(telegramUrl) + '">Telegram</a>', vkUrl && '<a href="' + escape(vkUrl) + '">ВКонтакте</a>'].filter(Boolean);
      alt.innerHTML = options.length ? 'Другие способы записи: ' + options.join(' · ') : '<a href="' + escape(contactOrganizer) + '">Написать организатору</a>';
    };
    updateEvening();

    const loadSeats = async () => {
      if (!selected || pendingSeats) return;
      const id = selected.id;
      const controller = new AbortController();
      pendingSeats = controller;
      try {
        const seats = await read('/seats?evening=' + encodeURIComponent(id), { signal: controller.signal });
        if (controller.signal.aborted || selected.id !== id) return;
        const entries = seats.evening_id === id && Array.isArray(seats.games) ? seats.games : [];
        board.hidden = entries.length === 0;
        const going = Number(seats.going) || 0;
        boardLabel.textContent = going ? 'Места за столом · записались: ' + going : 'Места за столом';
        games.innerHTML = entries.map((game) => {
          const free = Math.max(0, game.target - game.taken);
          return '<article class="join-game"><h4>Игра ' + escape(game.number) + ' · ' + escape(timeFormat.format(new Date(game.starts_at))) +
            '</h4><p>' + (free ? 'Свободно мест: ' + free : 'Свободных мест нет') + '</p>' +
            (game.people?.length ? '<p>' + game.people.map(escape).join(', ') + '</p>' : '') + '</article>';
        }).join('');
      } catch {
        // Keep the last successful update for the current evening.
      } finally {
        if (pendingSeats === controller) pendingSeats = null;
      }
    };

    datePicker?.addEventListener('change', (event) => {
      const next = evenings.find((evening) => evening.id === event.target.value);
      if (!next || next.id === selected.id) return;
      pendingSeats?.abort();
      pendingSeats = null;
      selected = next;
      board.hidden = true;
      board.open = false;
      games.replaceChildren();
      updateEvening();
      loadSeats();
    });
    form.querySelector('.join-kinds').addEventListener('change', (event) => {
      contactDrafts[contactKind] = field.value;
      contactKind = event.target.value;
      error.textContent = '';
      setContactField();
    });
    field.addEventListener('input', () => field.setCustomValidity(''));
    name.addEventListener('input', () => name.setCustomValidity(''));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      const cleanName = name.value.trim();
      const rawContact = field.value.trim();
      if (cleanName.length < 2) name.setCustomValidity('Укажи имя из двух или более символов.');
      if (contactKind === 'phone' && !/^(?:[78])?\d{10}$/.test(rawContact.replace(/\D/g, ''))) {
        field.setCustomValidity('Укажи номер в формате +7 (900) 123-45-67.');
      } else if (!rawContact) {
        field.setCustomValidity('Укажи контакт для связи.');
      }
      if (!form.reportValidity()) return;

      const evening = selected;
      const sentKind = contactKind;
      const payload = {
        name: cleanName, contact_kind: sentKind, contact_value: rawContact, source,
        evening_id: evening?.id || '', referred_by: root.querySelector('#join-friend').value,
        website: root.querySelector('#join-trap').value
      };
      error.textContent = '';
      submit.disabled = true;
      submit.textContent = 'Отправляем…';
      form.setAttribute('aria-busy', 'true');
      if (datePicker) datePicker.disabled = true;
      form.querySelector('.join-kinds').disabled = true;
      let finished = false;
      try {
        const response = await fetch(api + '/lead', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok !== true) throw new Error(response.status === 429 ? 'Слишком много попыток. Попробуй позже.' : data.error || 'Не получилось отправить заявку.');

        const heading = document.createElement('strong');
        const message = document.createElement('p');
        const link = document.createElement('a');
        link.href = contactOrganizer;
        link.textContent = 'Написать организатору';
        if (data.booked === true) {
          heading.textContent = evening ? 'Ты в списке · ' + day(evening.starts_at) : 'Ты в списке';
          message.append('Если планы изменятся, ', link, '.');
        } else if (data.already_booked === true) {
          heading.textContent = 'У тебя уже есть запись на другой вечер';
          message.append('Если хочешь её перенести, ', link, '.');
        } else {
          heading.textContent = 'Заявка получена';
          message.append(evening ? 'Место пока не подтверждено. Организатор свяжется с тобой по указанному контакту.' : 'Организатор свяжется с тобой, когда появится дата.');
        }
        result.replaceChildren(heading, message);
        result.hidden = false;
        form.hidden = true;
        root.querySelector('#join-form-heading').hidden = true;
        root.querySelector('#join-instructions').hidden = true;
        result.focus();
        finished = true;
        window.goal('lead_sent');
        loadSeats();
      } catch (failure) {
        error.textContent = (failure instanceof TypeError ? 'Нет связи с сайтом. Попробуй ещё раз.' : failure.message) + ' Другие способы записи указаны ниже.';
      } finally {
        form.removeAttribute('aria-busy');
        if (!finished) {
          if (datePicker) datePicker.disabled = false;
          form.querySelector('.join-kinds').disabled = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
      }
    });

    if (selected) {
      loadSeats();
      setInterval(() => { if (!document.hidden) loadSeats(); }, 10000);
    }
  };

  const showFallback = () => {
    root.innerHTML = '<p class="join-empty" role="status">Расписание сейчас не загрузилось. <a href="' + organizer + '">Напиши организатору</a> или проверь анонсы в <a href="' + telegram + '">Telegram клуба</a>.</p>';
  };
  info.then((data) => data ? mount(data) : showFallback()).catch(showFallback);
})();
