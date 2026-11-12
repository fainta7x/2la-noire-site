/* «Где играем»: фото клуба берём из приложения (раздел «Новичкам» в CRM), адрес — постоянный. */
(() => {
  const base = (window.JOIN_API || 'https://2la-noire-chagina7x.waw0.amvera.tech');
  const box = document.getElementById('place-photos');
  if (!box) return;
  fetch(base + '/api/public/welcome', { cache: 'no-store' }).then((r) => r.ok ? r.json() : Promise.reject(new Error('load')))
    .then((d) => {
      const list = (d.hero_photos || []).filter((u) => typeof u === 'string' && u.charAt(0) === '/').slice(0, 6);
      if (!list.length) return;
      box.innerHTML = list.map((u) => '<img src="' + base + u.replace(/"/g, '') + '" alt="Игра в клубе" loading="lazy">').join('');
    }).catch(() => {});
})();
