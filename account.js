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
    login.innerHTML = '<span class="account-label-long">Мой кабинет</span><span class="account-label-short" aria-hidden="true">Кабинет</span><svg class="account-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
    login.setAttribute('aria-label', 'Мой кабинет');
    login.classList.remove('account-login');
    login.classList.add('account-cabinet');
    if (crm) {
      const link = document.createElement('a');
      link.href = crm;
      link.className = 'account-crm';
      link.setAttribute('aria-label', 'CRM');
      link.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg><span>CRM</span>';
      box.append(link);
    }
    window.dispatchEvent(new CustomEvent('club:signed-in', { detail: { nickname: session.nickname, organizer: Boolean(session.organizer) } }));
  }).catch(() => {});
})();
