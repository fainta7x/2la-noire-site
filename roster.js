/* Public game rosters: one visible table per evening, shared across calendar filters. */
(() => {
  const { read } = window.club || {};
  if (!read || !document.getElementById('agenda')) return;
  const records = new Map();
  const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
  const date = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
  const make = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const count = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : fallback;

  const draw = record => {
    const games = record.games;
    if (!games.length) {
      record.root.replaceChildren(make('p', 'Игры этого вечера пока не опубликованы.', 'roster-status'));
      return;
    }
    const game = games.find(item => item.number === record.selected) || games[0];
    record.selected = game.number;
    const focused = record.root.contains(document.activeElement) ? document.activeElement.dataset.game : null;
    const header = make('div', undefined, 'roster-heading');
    header.append(make('p', 'Кто уже записался', 'roster-title'), make('p', 'Занято ' + game.taken + ' из ' + game.target, 'roster-count'));
    const controls = make('div', undefined, 'roster-games');
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Игры вечера');
    games.forEach(item => {
      const button = make('button', time.format(new Date(item.starts_at)) + ' · Игра ' + item.number);
      button.type = 'button';
      button.dataset.game = String(item.number);
      button.setAttribute('aria-pressed', String(item.number === game.number));
      button.addEventListener('click', () => {
        record.selected = item.number;
        draw(record);
        Array.from(record.root.querySelectorAll('[data-game]')).find(node => node.dataset.game === String(item.number))?.focus({ preventScroll: true });
      });
      controls.append(button);
    });
    const map = make('div', undefined, 'roster-map');
    const felt = make('div', undefined, 'roster-felt');
    felt.setAttribute('aria-hidden', 'true');
    felt.append(make('span', '2LA\nnoire'));
    const seats = make('ul', undefined, 'roster-seats');
    seats.setAttribute('aria-label', 'Участники игры ' + game.number + ' в ' + time.format(new Date(game.starts_at)));
    for (let index = 0; index < Math.max(game.target, game.taken, game.people.length); index++) {
      const taken = index < Math.max(game.taken, game.people.length);
      const seat = make('li', undefined, 'roster-seat' + (taken ? ' is-taken' : ''));
      const lamp = make('span', undefined, 'roster-lamp');
      lamp.setAttribute('aria-hidden', 'true');
      seat.append(lamp, make('span', game.people[index] || (taken ? 'Занято' : 'Свободно'), 'roster-nickname'));
      seats.append(seat);
    }
    map.append(felt, seats);
    const footer = make('div', undefined, 'roster-footer');
    footer.append(make('p', 'Свободно мест: ' + Math.max(0, game.target - game.taken), 'roster-free'), make('p', 'Расположение ников на схеме условное.', 'roster-note'));
    record.root.replaceChildren(header, controls, map, footer);
    if (focused) Array.from(record.root.querySelectorAll('[data-game]')).find(node => node.dataset.game === focused)?.focus({ preventScroll: true });
  };

  const refresh = async (record, force = false) => {
    if (record.pending) {
      if (force) record.refreshAgain = true;
      return;
    }
    if (!force && Date.now() - record.updated < 30000) return;
    record.pending = true;
    record.root.setAttribute('aria-busy', 'true');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const data = await read('/seats?evening=' + encodeURIComponent(record.id), { signal: controller.signal });
      if (data.evening_id !== record.id || !Array.isArray(data.games)) throw new Error('Roster unavailable');
      const games = data.games.filter(game => Number.isFinite(new Date(game.starts_at).getTime())).map(game => ({
        number: game.number, starts_at: game.starts_at, target: Math.max(1, count(game.target, 10)), taken: count(game.taken),
        people: Array.isArray(game.people) ? game.people.filter(name => typeof name === 'string') : []
      }));
      const signature = JSON.stringify(games);
      if (signature !== record.signature) {
        record.games = games;
        record.signature = signature;
        draw(record);
      }
    } catch {
      if (!record.games) {
        const notice = make('p', 'Состав сейчас не загрузился.', 'roster-status');
        const retry = make('button', 'Повторить');
        retry.type = 'button';
        retry.addEventListener('click', () => refresh(record, true));
        record.root.replaceChildren(notice, retry);
      }
    } finally {
      clearTimeout(timeout);
      record.updated = Date.now();
      record.pending = false;
      record.root.setAttribute('aria-busy', 'false');
      if (record.refreshAgain) {
        record.refreshAgain = false;
        refresh(record, true);
      }
    }
  };
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const record = records.get(entry.target.dataset.rosterEvening);
      if (!record) return;
      record.visible = entry.isIntersecting;
      if (record.visible) refresh(record);
    });
  }, { rootMargin: '160px' });
  const ensure = event => {
      if (!event.id) return null;
      if (!records.has(event.id)) {
        const root = make('section', undefined, 'evening-roster');
        root.dataset.rosterEvening = event.id;
        root.setAttribute('aria-label', 'Запись на игры · ' + date.format(new Date(event.starts_at)));
        root.setAttribute('aria-busy', 'true');
        root.append(make('p', 'Загружаем запись на игры…', 'roster-status'));
        const record = { id: event.id, root, updated: 0, pending: false, visible: false, games: null, selected: null, signature: null };
        records.set(event.id, record);
        observer.observe(root);
      }
      return records.get(event.id);
  };
  window.club.rosters = {
    // Attach the calendar only after each table has its real initial geometry;
    // a late roster response must not move the booking button under a pointer.
    async prepare(events) {
      await Promise.all(events.map(ensure).filter(Boolean).map(record => refresh(record)));
    },
    mount(event) { return ensure(event)?.root; }
  };
  setInterval(() => {
    if (!document.hidden) records.forEach(record => { if (record.visible) refresh(record); });
  }, 30000);
  window.addEventListener('booking:submitted', event => {
    const record = records.get(event.detail?.eveningId);
    if (record) refresh(record, true);
  });
})();
