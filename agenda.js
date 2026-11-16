(() => {
  const { read, safeLink, app, info, organizer } = window.club || {};
  if (!read) return;
  const make = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const dateText = (value, withTime, withYear) => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const text = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'long', day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}), ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(date);
    return text[0].toUpperCase() + text.slice(1);
  };
  const agenda = document.getElementById('agenda');
  if (agenda) Promise.all([read('/agenda').catch(() => null), info]).then(([data, welcome]) => {
    const available = (Array.isArray(welcome?.evenings) && welcome.evenings.length ? welcome.evenings : welcome?.evening ? [welcome.evening] : [])
      .filter(event => event && typeof event.id === 'string' && Number.isFinite(new Date(event.starts_at).getTime()));
    const knownDates = new Set(available.map(event => event.id));
    const fallback = available.map(event => ({ ...event, venue: event.venue?.name || '', title: event.title || 'Вечер для новичков', format: 'NOVICE' }));
    const listed = Array.isArray(data?.evenings) ? data.evenings : [];
    const items = [...listed, ...fallback.filter(event => !listed.some(item => item?.id === event.id))]
      .filter(item => item && Number.isFinite(new Date(item.starts_at).getTime()))
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    const cabinet = safeLink(data?.app_url + '/player') || app + '/player';
    const contactOrganizer = safeLink(welcome?.contacts?.find(entry => entry.label === 'Telegram')?.url) || organizer;
    const filters = make('div', undefined, 'booking-filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', 'Формат игры');
    const list = make('div', undefined, 'calendar-groups');
    list.id = 'calendar-events';
    const panel = document.getElementById('join');
    const panelHome = document.getElementById('schedule');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const keyFormat = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Moscow' });
    const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'Europe/Moscow' });
    const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
    let current = 'all';
    let showAll = false;
    let openedId = null;
    let views = new Map();
    const more = make('button', 'Показать все даты', 'calendar-more');
    more.type = 'button';
    const parkForm = () => {
      panelHome.append(panel);
      if (window.club.booking?.selectedId) panel.hidden = true;
    };
    const openEvening = (id, focus = false) => {
      const view = views.get(id);
      if (!view) return;
      const booking = window.club.booking;
      if (knownDates.has(id) && booking && !booking.select(id) && booking.selectedId !== id) {
        view.row.open = false;
        openEvening(booking.selectedId, true);
        return;
      }
      openedId = id;
      parkForm();
      views.forEach(other => { if (other !== view) other.row.open = false; });
      view.row.open = true;
      window.club.rosters?.open(view.item);
      if (knownDates.has(id) && booking?.selectedId === id) {
        view.body.append(panel);
        panel.hidden = false;
      }
      if (focus) {
        const result = document.getElementById('join-result');
        const target = !panel.hidden ? result && !result.hidden ? result : panel.querySelector('.join-heading, #join-form-heading') : view.summary;
        view.row.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
        target?.focus({ preventScroll: true });
      }
    };
    const closeEvening = () => {
      const view = views.get(openedId);
      openedId = null;
      if (!view) return;
      view.row.open = false;
      parkForm();
      view.summary.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'center' });
      view.summary.focus({ preventScroll: true });
    };
    const render = () => {
      parkForm();
      views = new Map();
      const visible = items.filter(item => current === 'all' || (current === 'novice' ? item.format === 'NOVICE' : item.format !== 'NOVICE'));
      const groups = new Map();
      visible.forEach(item => {
        const key = keyFormat.format(new Date(item.starts_at));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      });
      const rows = [];
      more.hidden = groups.size <= 2;
      more.textContent = showAll ? 'Скрыть дальние даты' : 'Показать все даты';
      more.setAttribute('aria-expanded', String(showAll));
      more.setAttribute('aria-controls', list.id);
      Array.from(groups.values()).slice(0, showAll ? undefined : 2).forEach(events => {
        const day = make('article', undefined, 'calendar-day');
        const dayText = dayFormat.format(new Date(events[0].starts_at));
        const heading = make('h3', dayText[0].toUpperCase() + dayText.slice(1), 'calendar-date');
        const slots = make('div', undefined, 'calendar-events');
        events.forEach(item => {
          const row = make('details', undefined, 'calendar-event');
          row.dataset.eveningId = item.id || '';
          const summary = make('summary', undefined, 'calendar-summary');
          const time = make('time', timeFormat.format(new Date(item.starts_at)), 'calendar-time');
          time.dateTime = item.starts_at;
          const title = make('span', item.title || (item.format === 'NOVICE' ? 'Вечер для новичков' : 'Клубные игры'), 'calendar-event-title');
          const count = window.club.rosters?.summary(item) || make('span', 'Запись в кабинете', 'calendar-attendance');
          const chevron = make('span', '+', 'calendar-chevron');
          chevron.setAttribute('aria-hidden', 'true');
          summary.append(time, title, count, chevron);
          const body = make('div', undefined, 'calendar-event-body');
          if (!knownDates.has(item.id)) {
            const details = make('div', undefined, 'calendar-club-details');
            details.append(make('p', [typeof item.venue === 'string' ? item.venue : item.venue?.name, 'Выбор игр и запись — в личном кабинете.'].filter(Boolean).join(' · ')));
            const link = make('a', 'Записаться в кабинете →', 'primary-button evening-cabinet-link');
            link.href = cabinet;
            details.append(link);
            body.append(details);
          }
          const roster = window.club.rosters?.mount(item);
          if (roster) body.append(roster);
          row.append(summary, body);
          const view = { item, row, summary, body };
          views.set(item.id, view);
          summary.addEventListener('click', event => {
            event.preventDefault();
            if (row.open) {
              openedId = item.id;
              closeEvening();
            } else openEvening(item.id);
          });
          row.addEventListener('toggle', () => {
            if (!row.isConnected) return;
            if (row.open) {
              if (openedId !== item.id || knownDates.has(item.id) && panel.parentElement !== body) openEvening(item.id);
            } else if (openedId === item.id) {
              openedId = null;
              parkForm();
            }
          });
          if (item.id === openedId) row.open = true;
          slots.append(row);
        });
        day.append(heading, slots);
        rows.push(day);
      });
      if (rows.length) list.replaceChildren(...rows);
      else {
        const notice = make('p', items.length ? 'В этом формате пока нет опубликованных дат. Посмотри другие игры или напиши организатору.' : 'Даты ближайших игр уточняются. ', 'booking-status');
        const link = make('a', 'Написать организатору');
        link.href = contactOrganizer;
        notice.append(document.createTextNode(' '), link);
        list.replaceChildren(notice);
      }
      filters.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === current)));
      if (views.has(openedId)) openEvening(openedId);
    };
    [['all', 'Все игры'], ['novice', 'Для новичков'], ['club', 'Клубные']].forEach(([value, label]) => {
      const button = make('button', label);
      button.type = 'button';
      button.dataset.filter = value;
      button.setAttribute('aria-controls', list.id);
      button.addEventListener('click', () => { current = value; render(); });
      filters.append(button);
    });
    more.addEventListener('click', () => { showAll = !showAll; render(); });
    agenda.replaceChildren(filters, list, more);
    agenda.setAttribute('aria-busy', 'false');
    render();
    document.getElementById('join-change')?.addEventListener('click', closeEvening);
    document.getElementById('join-close')?.addEventListener('click', closeEvening);
    list.addEventListener('keydown', event => {
      if (event.key === 'Escape' && openedId) {
        event.preventDefault();
        closeEvening();
      }
    });
    const openFromLink = (fromQuery = false) => {
      const requested = fromQuery ? new URLSearchParams(location.search).get('evening') : null;
      const id = items.some(item => item.id === requested) ? requested : ['#join', '#schedule'].includes(location.hash) ? window.club.booking?.selectedId : null;
      if (!id) return;
      current = 'all';
      const firstDays = Array.from(new Set(items.map(item => keyFormat.format(new Date(item.starts_at))))).slice(0, 2);
      const event = items.find(item => item.id === id);
      if (event && !firstDays.includes(keyFormat.format(new Date(event.starts_at)))) showAll = true;
      render();
      openEvening(id, true);
    };
    window.addEventListener('hashchange', () => openFromLink());
    openFromLink(true);
  }).catch(() => {
    const notice = make('p', 'Расписание можно уточнить у организатора. ', 'booking-status');
    const link = make('a', 'Написать организатору');
    link.href = organizer;
    notice.append(link);
    agenda.replaceChildren(notice);
    agenda.setAttribute('aria-busy', 'false');
  });

  const table = (caption, head, rows) => {
    const node = make('table', undefined, 'rating-table');
    node.append(make('caption', caption));
    const header = node.createTHead().insertRow();
    head.forEach((title) => { const cell = make('th', title); cell.scope = 'col'; header.append(cell); });
    const body = node.createTBody();
    rows.forEach((values) => { const row = body.insertRow(); values.forEach((value) => row.append(make('td', value ?? ''))); });
    return node;
  };

  const picture = (path, alt, fallback) => {
    const url = safeLink(path, new URL(app).origin);
    if (!url) return fallback();
    const link = make('a', undefined, 'result-picture');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    const image = make('img');
    image.alt = alt;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => link.replaceWith(fallback()), { once: true });
    image.src = url;
    link.append(image);
    return link;
  };

  const preview = (id, endpoint, render, onError) => {
    const node = document.getElementById(id);
    if (!node) return;
    read(endpoint).then((data) => render(node, data)).catch(() => onError?.(node)).catch(() => {});
  };

  const showResult = (node, item, title, description, fallback) => {
    const cached = node.querySelector('.result-picture');
    const url = safeLink(item.image, new URL(app).origin);
    if (cached && cached.href === url &&
        (cached.dataset.games === undefined || cached.dataset.games === String(item.games))) return;
    node.replaceChildren(make('h3', title), picture(item.image, description, fallback));
  };

  preview('club-evening', '/history', (node, data) => {
    const evening = data.evenings?.find((item) => item.format === 'CASUAL');
    if (!evening) {
      node.replaceChildren(make('p', 'Итогов клубных игр пока нет.'));
      return;
    }
    const date = dateText(evening.starts_at, false, true);
    showResult(node, evening, 'Итоги клубной игры', 'Итоги клубной игры · ' + date, () =>
      make('p', date + ' · игр: ' + evening.games + ' · игроков: ' + evening.players));
  });

  const ratingPicture = (leaders) => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 480 340');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', leaders.map((player) => player.place + '. ' + player.nickname + ' — ' + player.elo + ' Elo').join(', '));
    const draw = (tag, attributes, value) => {
      const element = document.createElementNS(ns, tag);
      Object.entries(attributes).forEach(([key, attribute]) => element.setAttribute(key, attribute));
      if (value !== undefined) element.textContent = value;
      svg.append(element);
    };
    svg.setAttribute('font-family', 'inherit');
    draw('rect', { width: 480, height: 340, rx: 16, fill: '#271b36' });
    draw('text', { x: 28, y: 49, fill: '#fff', 'font-size': 27, 'font-weight': 700 }, 'Топ-3 клуба');
    draw('text', { x: 450, y: 49, fill: '#e5c0f9', 'text-anchor': 'end', 'font-size': 22 }, 'Elo');
    leaders.forEach((player, index) => {
      const y = 77 + index * 79;
      draw('rect', { x: 24, y, width: 432, height: 62, rx: 12, fill: '#37264d' });
      draw('text', { x: 42, y: y + 39, fill: '#ffd195', 'font-size': 24 }, player.place);
      const nickname = String(player.nickname ?? '');
      const label = [...nickname].length > 16 ? [...nickname].slice(0, 15).join('') + '…' : nickname;
      draw('text', { x: 100, y: y + 39, fill: '#fff', 'font-size': 22 }, label);
      draw('text', { x: 436, y: y + 39, fill: '#fff', 'text-anchor': 'end', 'font-size': 24, 'font-weight': 700 }, player.elo);
    });
    const link = make('a', undefined, 'result-picture');
    link.href = '/rating/';
    link.append(svg);
    return link;
  };

  const showCurrentRating = async (node) => {
    const data = await read('/rating');
    const leaders = (data.players || []).slice(0, 3);
    node.replaceChildren(leaders.length ? ratingPicture(leaders) : make('p', 'Игроков в рейтинге пока нет.'));
  };

  preview('club-rating', '/seasons', async (node, data) => {
    const season = data.seasons?.find((item) => item.image);
    if (!season) return showCurrentRating(node);
    showResult(node, season, season.title, 'Таблица сезона ' + season.title, () => {
      const link = make('a', 'Открыть таблицу сезона', 'text-link');
      link.href = '/sezony/#season-results';
      return link;
    });
  }, showCurrentRating);

  preview('club-tournament', '/tournaments', (node, data) => {
    const latest = data.tournaments?.[0];
    if (!latest) {
      node.replaceChildren(make('p', 'Опубликованных итогов пока нет.'));
      return;
    }
    showResult(node, latest, latest.title, 'Итоговая таблица турнира ' + latest.title, () => {
      const link = make('a', 'Открыть итоги турнира', 'text-link');
      link.href = '/turniry/#tournament-results';
      return link;
    });
  });

  const tournaments = document.getElementById('tournament-results');
  if (tournaments) read('/tournaments').then((data) => {
    const items = Array.isArray(data.tournaments) ? data.tournaments : [];
    if (!items.length) return;
    tournaments.replaceChildren(make('h2', 'Итоги прошедших турниров'), ...items.map((item) => {
      const block = make('details', undefined, 'result-block');
      block.append(make('summary', item.title + (item.date ? ' · ' + dateText(item.date, false, true) : '')),
        picture(item.image, 'Итоговая таблица турнира ' + item.title, () => table('Таблица турнира', ['Место', 'Игрок', 'Очки', 'Победы', 'Игры'], (item.standings || []).map((row) => [row.place, row.name, row.points, row.wins, row.games]))));
      // Nominations: who won what. If the card cannot be drawn (no nominations), it simply disappears.
      if (item.nominations_image) block.append(picture(item.nominations_image, 'Номинации турнира ' + item.title, () => document.createComment('')));
      return block;
    }));
    tournaments.hidden = false;
  }).catch(() => {});

  const seasons = document.getElementById('season-results');
  if (seasons) read('/seasons').then((data) => {
    const items = Array.isArray(data.seasons) ? data.seasons : [];
    if (!items.length) return;
    seasons.replaceChildren(make('h2', 'Итоги сезонов'), ...items.map((item, index) => {
      const block = make('details', undefined, 'result-block');
      if (index === 0) block.open = true;
      block.append(make('summary', item.title + (item.current ? ' · идёт сейчас' : '')));
      block.append(make('p', [item.date_label, item.games + ' игр', item.evenings + ' вечеров', item.players + ' игроков'].filter(Boolean).join(' · '), 'agenda-meta'));
      if (item.leader) block.append(make('p', 'Лидер роста по Эло: ' + item.leader.nickname + ' (' + item.leader.value + ')'));
      if (item.mvp) block.append(make('p', 'MVP сезона: ' + item.mvp.nickname + ' (' + item.mvp.value + ')'));
      block.append(make('h3', 'Таблица сезона'),
        picture(item.image, 'Топ-10 сезона ' + item.title, () => table('Топ-10 по изменению Эло', ['Место', 'Игрок', 'Эло', 'Игры'], (item.rows || []).map((row) => [row.place, row.nickname, row.value, row.detail]))));
      if (item.nominations_image) block.append(make('h3', 'Номинации сезона'), picture(item.nominations_image, 'Номинации сезона ' + item.title, () => document.createComment('')));
      return block;
    }));
    seasons.hidden = false;
  }).catch(() => {});

  const history = document.getElementById('evening-history');
  if (history) read('/history').then((data) => {
    const items = Array.isArray(data.evenings) ? data.evenings : [];
    if (!items.length) return;
    history.replaceChildren(make('h2', 'Как прошли последние вечера'), ...items.map((item) => {
      const block = make('article', undefined, 'result-block');
      block.append(make('h3', dateText(item.starts_at, false, true)), make('p', item.format_label + ' · игр: ' + item.games + ' · игроков: ' + item.players + ' · победы красных: ' + item.red_wins + ', чёрных: ' + item.black_wins, 'agenda-meta'));
      block.append(picture(item.image, 'Итоги вечера ' + dateText(item.starts_at), () => {
        const text = make('p', (item.most_wins || []).length ? 'Больше всех побед: ' + item.most_wins.map((entry) => entry.nickname + ' (' + entry.value + ')').join(', ') : '');
        return text;
      }));
      return block;
    }));
    history.hidden = false;
  }).catch(() => {});
})();
