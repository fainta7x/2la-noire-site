/* Тексты сайта и рейтинг берём из приложения клуба (CRM → Ещё → Сайт клуба). Если приложение не отвечает, остаются тексты из страницы. */
(() => {
  const base = (window.JOIN_API || 'https://2la-noire-chagina7x.waw0.amvera.tech') + '/api/public/welcome';
  const text = (selector, value) => { const el = document.querySelector(selector); if (el && typeof value === 'string' && value.trim()) el.textContent = value; };
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const link = (selector, value) => { if (typeof value === 'string' && /^https:\/\//i.test(value)) document.querySelectorAll(selector).forEach((a) => { a.href = value; }); };

  fetch(base, { cache: 'no-store' }).then((r) => r.ok ? r.json() : Promise.reject(new Error('load'))).then((d) => {
    const s = d.site || {};
    text('.hero-lead', s.hero_lead);
    text('.hero-note span:last-child', s.schedule_line);
    text('#about .about-text', s.about);
    text('#rules-text', s.rules);
    text('.evening-lead', s.newcomers);
    if (typeof s.evening === 'string' && s.evening.trim()) {
      const items = s.evening.split(/\n\s*\n/).map((b) => b.trim().split('\n')).filter((l) => l.length > 1);
      const list = document.getElementById('evening-steps');
      if (list && items.length) list.innerHTML = items.map((l) => '<li><span>' + esc(l[0]) + '</span><div><p>' + esc(l.slice(1).join(' ')) + '</p></div></li>').join('');
    }
    if (typeof s.audience === 'string' && s.audience.trim()) {
      const lines = s.audience.split('\n').map((x) => x.trim()).filter(Boolean);
      const grid = document.getElementById('audience-grid');
      if (grid && lines.length) grid.innerHTML = lines.map((t) => '<article><h3>' + esc(t) + '</h3></article>').join('');
    }
    text('.rating-text', s.rating);
    text('.place-text', s.place);
    link('a[href^="https://t.me/mafiatulasport"]', s.telegram_url);
    link('#hub-vk', s.vk_url);
    (d.contacts || []).forEach((c) => { if (c.label === 'Telegram') link('#hub-write', c.url); });
    if (typeof s.benefits === 'string' && s.benefits.trim()) {
      const cards = s.benefits.split(/\n\s*\n/).map((b) => b.trim().split('\n')).filter((l) => l.length > 1);
      const grid = document.getElementById('benefit-grid');
      if (grid && cards.length) grid.innerHTML = cards.map((l) => '<article><h3>' + esc(l[0]) + '</h3><p>' + esc(l.slice(1).join(' ')) + '</p></article>').join('');
    }
    if (typeof s.faq === 'string' && s.faq.trim()) {
      const items = s.faq.split(/\n\s*\n/).map((b) => b.trim().split('\n')).filter((l) => l.length > 1);
      const list = document.querySelector('.faq-list');
      if (list && items.length) list.innerHTML = items.map((l) => '<details><summary>' + esc(l[0]) + '</summary><p>' + esc(l.slice(1).join(' ')) + '</p></details>').join('');
    }
  }).catch(() => {});

  const board = document.getElementById('rating-board');
  if (board) fetch(base + '/rating', { cache: 'no-store' }).then((r) => r.ok ? r.json() : Promise.reject(new Error('load'))).then((d) => {
    const rows = d.players || [];
    if (!rows.length) return;
    board.innerHTML = '<table class="rating-table"><thead><tr><th>#</th><th>Игрок</th><th>Рейтинг</th><th>Игр</th></tr></thead><tbody>' +
      rows.slice(0, 10).map((p) => '<tr><td>' + p.place + '</td><td>' + esc(p.nickname) + '</td><td>' + p.elo + '</td><td>' + p.games + '</td></tr>').join('') + '</tbody></table>' +
      (rows.length > 10 ? '<p class="rating-more">Показаны первые 10 из ' + rows.length + '</p>' : '');
    board.hidden = false;
  }).catch(() => {});
})();
