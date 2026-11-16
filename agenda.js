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
    const available = Array.isArray(welcome?.evenings) && welcome.evenings.length ? welcome.evenings : welcome?.evening ? [welcome.evening] : [];
    const knownDates = new Set(available.map(event => event.id));
    const fallback = available.map(event => ({ ...event, venue: event.venue?.name || '', title: event.title || 'Вечер для новичков', format: 'NOVICE', format_label: 'Для новичков' }));
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
    let current = 'all';
    const keyFormat = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Moscow' });
    const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'Europe/Moscow' });
    const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const panel = document.getElementById('join');
    const panelHome = document.getElementById('schedule');
    let opened = false;

    const focusPanel = () => {
      const done = document.getElementById('join-result');
      const focus = done && !done.hidden ? done : panel.querySelector('.join-heading, #join-form-heading');
      panel.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
      focus?.focus({ preventScroll: true });
    };

    const render = () => {
      // Park the same DOM node before replacing calendar rows. Rebuilding or
      // cloning the form here would discard drafts and pending submissions.
      if (window.club.booking?.selectedId) {
        panelHome.append(panel);
        panel.hidden = true;
      }
      const visible = items.filter(item => current === 'all' || (current === 'novice' ? item.format === 'NOVICE' : item.format !== 'NOVICE'));
      const groups = new Map();
      visible.forEach(item => {
        const key = keyFormat.format(new Date(item.starts_at));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      });
      const rows = [];
      groups.forEach(events => {
        const first = new Date(events[0].starts_at);
        const parts = dayFormat.formatToParts(first);
        const part = type => parts.find(entry => entry.type === type)?.value || '';
        const row = make('article', undefined, 'calendar-day');
        const heading = make('h3', undefined, 'calendar-date');
        heading.append(make('strong', part('day')), make('span', part('month')), make('span', part('weekday')));
        let slots = make('div', undefined, 'calendar-events');
        let hasPanel = false;
        events.forEach(item => {
          const novice = item.format === 'NOVICE';
          const card = make('div', undefined, 'calendar-event');
          card.dataset.eveningId = item.id || '';
          const details = make('div');
          details.append(make('span', item.format_label || (novice ? 'Для новичков' : 'Клубный'), 'calendar-format' + (novice ? '' : ' calendar-format-club')));
          const title = make('h4');
          const time = make('time', timeFormat.format(new Date(item.starts_at)));
          time.dateTime = item.starts_at;
          title.append(time, document.createTextNode(' · ' + (item.title || (novice ? 'Вечер для новичков' : 'Клубная игра'))));
          details.append(title);
          const own = available.find(event => event.id === item.id);
          const meta = [typeof item.venue === 'string' ? item.venue : item.venue?.name, novice ? own?.schedule : 'Запись через личный кабинет'].filter(Boolean);
          if (meta.length) details.append(make('p', meta.join(' · '), 'calendar-meta'));
          const count = item.free_seats;
          const full = count !== null && count !== undefined && Number.isFinite(Number(count)) && Number(count) <= 0;
          if (count !== null && count !== undefined && Number.isFinite(Number(count))) {
            details.append(make('p', full ? 'Свободных мест нет' : 'Есть свободные места', 'calendar-capacity' + (full ? ' calendar-capacity-full' : '')));
          }
          const direct = novice && knownDates.has(item.id) && !full;
          const link = make('a', full ? 'Уточнить у организатора' : direct ? 'Записаться' : 'Записаться в кабинете', 'calendar-action' + (direct ? ' calendar-action-primary' : ''));
          link.href = full ? contactOrganizer : direct ? '#join' : cabinet;
          link.setAttribute('aria-label', link.textContent + ' · ' + dateText(item.starts_at, true));
          if (direct) {
            const expanded = opened && window.club.booking?.selectedId === item.id;
            link.setAttribute('aria-controls', panel.id);
            link.setAttribute('aria-expanded', String(expanded));
            if (expanded) {
              link.textContent = 'К форме записи ↓';
              link.setAttribute('aria-label', 'К форме записи · ' + dateText(item.starts_at, true));
              row.classList.add('calendar-day-selected');
            }
            link.addEventListener('click', event => {
              const booking = window.club.booking;
              if (!booking) return;
              event.preventDefault();
              booking.select(item.id);
              opened = true;
              render();
              focusPanel();
            });
          }
          card.append(details, link);
          slots.append(card);
          if (opened && item.id === window.club.booking?.selectedId) {
            row.append(heading, slots, panel);
            panel.hidden = false;
            hasPanel = true;
            slots = make('div', undefined, 'calendar-events');
          }
        });
        if (!hasPanel) row.append(heading);
        if (slots.childElementCount) row.append(slots);
        rows.push(row);
      });
      if (rows.length) list.replaceChildren(...rows);
      else {
        const empty = make('p', items.length ? 'В этом формате пока нет опубликованных дат. Посмотри другие игры или напиши организатору.' : 'Даты ближайших игр уточняются. Напиши организатору — подскажем, когда можно прийти.', 'booking-status');
        const link = make('a', 'Написать организатору');
        link.href = contactOrganizer;
        empty.append(document.createTextNode(' '), link);
        list.replaceChildren(empty);
      }
      filters.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === current)));
    };
    [['all', 'Все игры'], ['novice', 'Для новичков'], ['club', 'Клубные']].forEach(([value, label]) => {
      const button = make('button', label);
      button.type = 'button';
      button.dataset.filter = value;
      button.setAttribute('aria-controls', list.id);
      button.addEventListener('click', () => { current = value; render(); });
      filters.append(button);
    });
    agenda.replaceChildren(filters, list);
    agenda.hidden = false;
    agenda.setAttribute('aria-busy', 'false');
    render();
    document.getElementById('join-change')?.addEventListener('click', () => {
      const id = window.club.booking.selectedId;
      opened = false;
      render();
      const trigger = Array.from(list.querySelectorAll('.calendar-event')).find(card => card.dataset.eveningId === id)?.querySelector('a');
      trigger?.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'center' });
      trigger?.focus({ preventScroll: true });
    });
    const openFromLink = (fromQuery = false) => {
      const booking = window.club.booking;
      const hasAnchor = ['#join', '#schedule'].includes(location.hash);
      const hasEvening = fromQuery && knownDates.has(new URLSearchParams(location.search).get('evening'));
      if (!booking?.selectedId || !(hasAnchor || hasEvening)) return;
      opened = true;
      // A direct newcomer link should remain reachable even if a club filter
      // was selected earlier on this page.
      current = 'all';
      render();
      if (!panel.hidden) focusPanel();
    };
    window.addEventListener('hashchange', () => openFromLink());
    openFromLink(true);
  }).catch(() => {
    const notice = make('p', 'Не удалось загрузить расписание. ', 'booking-status');
    const link = make('a', 'Написать организатору');
    link.href = organizer;
    notice.append(link);
    agenda.replaceChildren(notice);
    agenda.hidden = false;
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
