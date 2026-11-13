(() => {
  const { app, info, read, safeLink } = window.club;
  // The API returns legacy defaults as well as saved CRM text. Keep saved overrides.
  const legacy = {
    "hero_lead": "Приходи играть в спортивную мафию в Туле. Новичкам всё объясним с нуля, опыт не нужен.",
    "schedule_line": "Каждую пятницу, 18:30–21:00 · первые 2 вечера бесплатно",
    "about": "Спортивная мафия — командная игра, где побеждает логика, а не удача. Нужно слушать, спорить, убеждать и просчитывать ходы. По ней проводят турниры и чемпионаты, а у нас есть клуб и школа для новичков.",
    "newcomers": "Объясним правила и сыграем первые игры вместе. Ничего знать заранее не нужно.",
    "benefits": "Новый вид спорта\nПопробуй себя в официальном интеллектуальном спорте со своими правилами, судьями и турнирами.\n\nТурниры и поездки\nИграй на турнирах с игроками из разных городов и стран. Поездки и путешествия вместе.\n\nПризы и награды\nЗа победы на турнирах дают денежные призы и награды.\n\nЖивое сообщество\nИгры, встречи и клубные движухи: скучно не бывает.\n\nОнлайн-игры\nНе получается прийти? Играй онлайн.\n\nПрокачка навыков\nПрокачай речь, мышление, стратегию и тактику. Научись понимать людей.\n\nГолова, а не удача\nЗдесь выигрывает тот, кто считает ходы и замечает мелочи.\n\nГоворить уверенно\nУчишься коротко и убедительно отстаивать свою мысль перед людьми.\n\nХладнокровие\nБлеф, давление, неожиданные повороты. Учишься не терять голову.\n\nНовые знакомства\nИнтересные люди, общие эмоции и компания, в которую хочется вернуться.\n\nСвой путь\nНачинаешь с первой игры, растёшь в рейтинге, едешь на турниры. В своём темпе.\n\nАзарт\nКаждая игра — новая история: споры, повороты, победа командой.",
    "audience": "Играешь в Dota 2 или CS2, любишь шахматы, покер или сложные настолки? Тебе понравится. Как и всем, кто любит соревноваться и побеждать.",
    "rating": "Каждая сыгранная игра идёт в рейтинг. Чем больше играешь, тем выше твой ник в таблице.",
    "place": "Кафе «Суп с котом», Пушкинский проезд, 4А. По пятницам с 18:30 до 21:00.",
    "faq": "Я никогда не играл. Мне можно?\nМожно. Правила объясним до игры, сыграем вместе, потом разберём игру.\n\nКогда и где играем?\nПо пятницам с 18:30 до 21:00 в кафе «Суп с котом». Первые два вечера бесплатно.\n\nКак записаться?\nВыбери пятницу выше, оставь имя и контакт. Место закрепится за тобой, а мы напишем и подтвердим."
  };
  const fields = {
    hero_lead: '.hero-lead',
    schedule_line: '.schedule-note',
    about: '#about-copy',
    newcomers: '#newcomers-copy',
    audience: '.culture-copy',
    rating: '#rating-copy',
    place: '.place-text'
  };
  const make = (tag, text) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const customized = (site, key) => {
    const value = typeof site[key] === 'string' ? site[key].replace(/\r\n/g, '\n').trim() : '';
    return value && value !== legacy[key] ? value : '';
  };
  const blocks = (value) => value.split(/\n\s*\n/).map((block) => block.trim().split('\n')).filter((lines) => lines.length > 1);
  const updateLink = (selector, value) => {
    const url = safeLink(value);
    const anchor = document.querySelector(selector);
    if (url && anchor) anchor.href = url;
  };

  info.then((data) => {
    if (!data) return;
    const site = data.site || {};
    Object.entries(fields).forEach(([key, selector]) => {
      const value = customized(site, key);
      const field = document.querySelector(selector);
      if (value && field) {
        field.textContent = value;
        field.hidden = false;
      }
    });
    updateLink('#hub-tg', site.telegram_url);
    updateLink('#hub-vk', site.vk_url);
    updateLink('#hub-write', data.contacts?.find((entry) => entry.label === 'Telegram')?.url);

    const benefits = blocks(customized(site, 'benefits'));
    const grid = document.getElementById('benefit-grid');
    if (grid && benefits.length) {
      grid.replaceChildren(...benefits.map(([title, ...lines]) => {
        const card = make('article');
        card.append(make('h4', title), make('p', lines.join(' ')));
        return card;
      }));
      grid.hidden = false;
    }

    const questions = blocks(customized(site, 'faq'));
    const faq = document.querySelector('.faq-list');
    if (faq && questions.length) {
      faq.replaceChildren(...questions.map(([question, ...lines]) => {
        const item = make('details');
        item.append(make('summary', question), make('p', lines.join(' ')));
        return item;
      }));
    }

    const nextDate = document.getElementById('next-evening-date');
    if (nextDate && data.evening) {
      const evening = data.evening;
      const startsAt = new Date(evening.starts_at);
      if (Number.isFinite(startsAt.getTime())) {
        const formatted = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'long', day: 'numeric', month: 'long' }).format(startsAt);
        nextDate.textContent = formatted[0].toUpperCase() + formatted.slice(1);
        nextDate.hidden = false;
      }
    }

    const gallery = document.getElementById('place-photos');
    if (!gallery) return;
    const alreadyShown = new Set(Array.from(gallery.children, (item) => item.dataset.original));
    const photos = Array.isArray(data.hero_photos) ? data.hero_photos : [];
    photos.filter((path) => typeof path === 'string' && path.startsWith('/') && !alreadyShown.has(path))
      .slice(0, 3).forEach((path) => {
        const url = safeLink(path, app);
        if (!url) return;
        const link = make('a');
        link.className = 'photo photo-extra';
        link.href = url;
        link.dataset.original = path;
        const image = make('img');
        image.alt = 'Игровой вечер 2LA noire';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.addEventListener('error', () => link.remove(), { once: true });
        link.append(image);
        image.src = url;
        gallery.append(link);
      });
  }).catch(() => {});

  const board = document.getElementById('rating-board');
  if (!board) return;
  read('/rating').then((data) => {
    const players = Array.isArray(data.players) ? data.players : [];
    if (!players.length) return;
    const table = make('table');
    table.className = 'rating-table';
    table.append(make('caption', 'Таблица игроков'));
    const head = table.createTHead().insertRow();
    ['Место', 'Игрок', 'Рейтинг', 'Игр'].forEach((title) => {
      const cell = make('th', title);
      cell.scope = 'col';
      head.append(cell);
    });
    const rows = table.createTBody();
    const more = table.createTBody();
    more.id = 'rating-more';
    more.hidden = true;
    players.forEach((player, index) => {
      const row = (index < 5 ? rows : more).insertRow();
      [player.place, player.nickname, player.elo, player.games].forEach((value) => row.append(make('td', value ?? '')));
    });
    board.append(table);
    if (players.length > 5) {
      const toggle = make('button', 'Показать всех игроков (' + players.length + ')');
      toggle.type = 'button';
      toggle.className = 'rating-toggle';
      toggle.setAttribute('aria-controls', more.id);
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => {
        more.hidden = !more.hidden;
        toggle.setAttribute('aria-expanded', String(!more.hidden));
        toggle.textContent = more.hidden ? 'Показать всех игроков (' + players.length + ')' : 'Свернуть список';
      });
      board.append(toggle);
    }
    board.hidden = false;
  }).catch(() => {});
})();
