(() => {
  const box = document.getElementById('account');
  const { app, read, safeLink } = window.club;
  if (!box) return;
  const login = box.querySelector('.account-login');

  read('/session', { credentials: 'include' }).then((session) => {
    document.documentElement.dataset.signedIn = session.signed_in ? '1' : '0';
    if (!session.signed_in) {
      const url = safeLink(session.login_url);
      if (url) login.href = url;
      return;
    }

    const cabinet = safeLink(session.cabinet_url) || app + '/player';
    const crm = safeLink(session.crm_url);
    login.href = cabinet;
    login.textContent = 'Мой кабинет';
    login.classList.remove('account-login');
    if (crm) {
      const link = document.createElement('a');
      link.href = crm;
      link.textContent = 'CRM';
      box.append(link);
    }
    window.dispatchEvent(new CustomEvent('club:signed-in', { detail: { nickname: session.nickname, organizer: Boolean(session.organizer) } }));
  }).catch(() => {});
})();
