/* Compact public counts and the participant list inside an opened evening. */
(() => {
  const { read } = window.club || {};
  if (!read || !document.getElementById('agenda')) return;
  const records = new Map();
  const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
  const make = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const number = value => Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : null;

  const draw = record => {
    const game = record.games?.find(item => item.number === record.selected) || record.games?.[0];
    const main = make('span', undefined, 'attendance-count');
    const note = make('small', undefined, 'attendance-note');
    if (game) {
      record.selected = game.number;
      main.textContent = 'Записались ' + game.taken + ' из ' + game.target;
      note.textContent = 'Игра ' + game.number + ' · ' + time.format(new Date(game.starts_at));
    } else {
      const free = record.event.free_seats == null ? null : number(record.event.free_seats);
      main.textContent = free == null ? (record.status === 'loading' ? 'Загружаем запись…' : 'Запись открыта') : 'Свободно мест: ' + free;
      note.textContent = record.event.format === 'NOVICE' ? 'Для новичков' : 'Через личный кабинет';
    }
    record.header.replaceChildren(main, note);
    if (!game) {
      const novice = record.event.format === 'NOVICE';
      const message = record.status === 'loading' ? 'Загружаем участников…' : novice ? 'Список участников можно уточнить у организатора.' : 'Состав и запись доступны в личном кабинете.';
      record.root.replaceChildren(make('p', message, 'roster-status'));
      if (novice && record.status !== 'loading') {
        const retry = make('button', 'Обновить список', 'roster-retry');
        retry.type = 'button';
        retry.addEventListener('click', () => refresh(record, true));
        record.root.append(retry);
      }
      return;
    }
    const focused = record.root.contains(document.activeElement) ? document.activeElement.dataset.game : null;
    const heading = make('h4', 'Участники', 'roster-title');
    const controls = make('div', undefined, 'roster-games');
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Игры вечера');
    record.games.forEach(item => {
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
    const participants = make('ul', undefined, 'roster-people');
    participants.setAttribute('aria-label', 'Участники игры ' + game.number);
    game.people.forEach(name => participants.append(make('li', name, 'roster-person')));
    const members = game.people.length ? participants : make('p', game.taken ? 'Записались: ' + game.taken + '. Ники можно уточнить у организатора.' : 'Пока никто не записался.', 'roster-empty');
    record.root.replaceChildren(heading, controls, members);
    if (focused) Array.from(record.root.querySelectorAll('[data-game]')).find(node => node.dataset.game === focused)?.focus({ preventScroll: true });
  };

  const refresh = async (record, force = false) => {
    if (record.pending) {
      if (force) record.refreshAgain = true;
      return;
    }
    if (!force && Date.now() - record.updated < 30000) return;
    record.pending = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const data = await read('/seats?evening=' + encodeURIComponent(record.event.id), { signal: controller.signal });
      if (data.evening_id === record.event.id && Array.isArray(data.games)) {
        const games = data.games.filter(game => Number.isFinite(new Date(game.starts_at).getTime()) && number(game.target) > 0 && number(game.taken) != null).map(game => ({
          number: game.number, starts_at: game.starts_at, target: number(game.target), taken: number(game.taken),
          people: Array.isArray(game.people) ? game.people.filter(name => typeof name === 'string') : []
        }));
        const signature = JSON.stringify(games);
        if (signature !== record.signature) {
          record.games = games;
          record.signature = signature;
          record.status = 'ready';
          draw(record);
        }
      } else if (!record.games) {
        record.status = 'unavailable';
        draw(record);
      }
    } catch {
      if (!record.games) {
        record.status = 'unavailable';
        draw(record);
      }
    } finally {
      clearTimeout(timeout);
      record.updated = Date.now();
      record.pending = false;
      if (record.refreshAgain) {
        record.refreshAgain = false;
        refresh(record, true);
      }
    }
  };
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const record = records.get(entry.target.dataset.rosterCount);
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
      root.setAttribute('aria-label', 'Участники вечера');
      const header = make('span', undefined, 'calendar-attendance');
      header.dataset.rosterCount = event.id;
      const record = { event, root, header, games: null, selected: null, status: 'loading', updated: 0, pending: false, visible: false, signature: null };
      records.set(event.id, record);
      draw(record);
      observer.observe(header);
      refresh(record);
    }
    return records.get(event.id);
  };
  window.club.rosters = {
    summary(event) { return ensure(event)?.header; },
    mount(event) { return ensure(event)?.root; },
    open(event) { const record = ensure(event); if (record) refresh(record); }
  };
  setInterval(() => {
    if (!document.hidden) records.forEach(record => { if (record.visible) refresh(record); });
  }, 30000);
  window.addEventListener('booking:submitted', event => {
    const record = records.get(event.detail?.eveningId);
    if (record) refresh(record, true);
  });
})();
