(() => {
  const { read, safeLink, app } = window.club || {};
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
  const seatsText = (count) => count === null || count === undefined ? '' : count > 0 ? 'Свободно мест: ' + count : 'Мест нет';

  const agenda = document.getElementById('agenda');
  if (agenda) read('/agenda').then((data) => {
    const items = Array.isArray(data.evenings) ? data.evenings : [];
    if (!items.length) return;
    const list = make('div', undefined, 'agenda-list');
    const cabinet = safeLink(data.app_url + '/player') || app + '/player';
    items.forEach((item) => {
      const card = make('article', undefined, 'agenda-card');
      card.append(make('h3', dateText(item.starts_at, true)), make('p', item.format_label + (item.venue ? ' · ' + item.venue : ''), 'agenda-meta'));
      const seats = seatsText(item.free_seats);
      if (seats) card.append(make('p', seats, 'agenda-seats'));
      const link = make('a', item.format === 'NOVICE' ? 'Записаться' : 'Записаться в кабинете', 'secondary-button');
      link.href = item.format === 'NOVICE' ? '#join' : cabinet;
      card.append(link);
      list.append(card);
    });
    agenda.replaceChildren(make('h2', 'Ближайшие игры'), list);
    agenda.hidden = false;
  }).catch(() => {});

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
      make('p', date + ' · партий: ' + evening.games + ' · игроков: ' + evening.players));
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
        picture(item.image, 'Итоговая таблица турнира ' + item.title, () => table('Таблица турнира', ['Место', 'Игрок', 'Очки', 'Победы', 'Игры'], item.standings.map((row) => [row.place, row.name, row.points, row.wins, row.games]))));
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
        picture(item.image, 'Топ-10 сезона ' + item.title, () => table('Топ-10 по изменению Эло', ['Место', 'Игрок', 'Эло', 'Игры'], item.rows.map((row) => [row.place, row.nickname, row.value, row.detail]))));
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
        const text = make('p', item.most_wins.length ? 'Больше всех побед: ' + item.most_wins.map((entry) => entry.nickname + ' (' + entry.value + ')').join(', ') : '');
        return text;
      }));
      return block;
    }));
    history.hidden = false;
  }).catch(() => {});
})();
