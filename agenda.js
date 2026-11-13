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

  const preview = (id, endpoint, render) => {
    const node = document.getElementById(id);
    if (!node) return;
    read(endpoint).then((data) => render(node, data)).catch(() => {});
  };

  preview('club-evening', '/agenda', (node, data) => {
    const evening = (data.evenings || []).find((item) => item.format === 'CASUAL' && dateText(item.starts_at));
    if (!evening) {
      node.replaceChildren(make('p', 'Новая дата пока не объявлена.'));
      return;
    }
    const when = make('time', dateText(evening.starts_at, true), 'club-preview-date');
    when.dateTime = evening.starts_at;
    const seats = seatsText(evening.free_seats);
    node.replaceChildren(make('h3', 'Ближайшая игра'), when);
    if (seats) node.append(make('p', seats, 'agenda-seats'));
  });

  preview('club-rating', '/rating', (node, data) => {
    const leaders = (data.players || []).slice(0, 3);
    if (!leaders.length) {
      node.replaceChildren(make('p', 'Игроков в таблице пока нет.'));
      return;
    }
    node.replaceChildren(table('Топ-3 клуба', ['Место', 'Игрок', 'Elo'], leaders.map((player) => [player.place, player.nickname, player.elo])));
  });

  preview('club-tournament', '/tournaments', (node, data) => {
    const latest = (data.tournaments || [])[0];
    if (!latest) {
      node.replaceChildren(make('p', 'Опубликованных итогов пока нет.'));
      return;
    }
    const date = dateText(latest.date, false, true);
    const winner = latest.standings?.find((row) => Number(row.place) === 1);
    node.replaceChildren(make('h3', 'Последний турнир'), make('p', latest.title, 'club-preview-date'));
    if (date) node.append(make('p', date));
    if (winner?.name) node.append(make('p', 'Победитель — ' + winner.name));
  });

  const tournaments = document.getElementById('tournament-results');
  if (tournaments) read('/tournaments').then((data) => {
    const items = Array.isArray(data.tournaments) ? data.tournaments : [];
    if (!items.length) return;
    tournaments.replaceChildren(make('h2', 'Итоги прошедших турниров'), ...items.map((item) => {
      const block = make('details', undefined, 'result-block');
      block.append(make('summary', item.title + (item.date ? ' · ' + dateText(item.date, false, true) : '')),
        picture(item.image, 'Итоговая таблица турнира ' + item.title, () => table('Таблица турнира', ['Место', 'Игрок', 'Очки', 'Победы', 'Игры'], item.standings.map((row) => [row.place, row.name, row.points, row.wins, row.games]))));
      return block;
    }));
    tournaments.hidden = false;
  }).catch(() => {});

  const seasons = document.getElementById('season-results');
  if (seasons) read('/seasons').then((data) => {
    const items = Array.isArray(data.seasons) ? data.seasons : [];
    if (!items.length) return;
    seasons.replaceChildren(make('h2', 'Таблицы сезонов'), ...items.map((item, index) => {
      const block = make('details', undefined, 'result-block');
      if (index === 0) block.open = true;
      const range = [item.starts_at, item.ends_at].map((value) => dateText(value, false, true).replace(/^[^,]+, /, '')).join(' — ');
      block.append(make('summary', item.title + (range.trim() !== '—' ? ' · ' + range : '')),
        picture(item.image, 'Таблица сезона ' + item.title, () => table('Таблица сезона', ['Место', 'Игрок', 'Результат', 'Игры'], item.rows.map((row) => [row.place, row.nickname, row.value, row.detail]))));
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
