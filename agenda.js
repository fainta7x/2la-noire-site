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

  const tournaments = document.getElementById('tournament-results');
  if (tournaments) read('/tournaments').then((data) => {
    const items = Array.isArray(data.tournaments) ? data.tournaments : [];
    if (!items.length) return;
    tournaments.replaceChildren(make('h2', 'Итоги прошедших турниров'), ...items.map((item) => {
      const block = make('details', undefined, 'result-block');
      block.append(make('summary', item.title + (item.date ? ' · ' + dateText(item.date, false, true) : '')),
        table('Таблица турнира', ['Место', 'Игрок', 'Очки', 'Победы', 'Игры'], item.standings.map((row) => [row.place, row.name, row.points, row.wins, row.games])));
      return block;
    }));
    tournaments.hidden = false;
  }).catch(() => {});

  const history = document.getElementById('evening-history');
  if (history) read('/history').then((data) => {
    const items = Array.isArray(data.evenings) ? data.evenings : [];
    if (!items.length) return;
    history.replaceChildren(make('h2', 'Как прошли последние вечера'), ...items.map((item) => {
      const block = make('article', undefined, 'result-block');
      block.append(make('h3', dateText(item.starts_at, false, true)), make('p', item.format_label + ' · игр: ' + item.games + ' · игроков: ' + item.players + ' · победы красных: ' + item.red_wins + ', чёрных: ' + item.black_wins, 'agenda-meta'));
      if (item.most_wins.length) block.append(make('p', 'Больше всех побед: ' + item.most_wins.map((entry) => entry.nickname + ' (' + entry.value + ')').join(', ')));
      return block;
    }));
    history.hidden = false;
  }).catch(() => {});
})();
