(() => {
  const gallery = document.getElementById('place-photos');
  const dialog = document.getElementById('photo-dialog');
  if (!gallery || !dialog?.showModal) return;
  const image = dialog.querySelector('img');
  const description = dialog.querySelector('figcaption');
  const previous = dialog.querySelector('.photo-prev');
  const next = dialog.querySelector('.photo-next');
  let links = [];
  let index = 0;
  let opener;
  const filters = document.getElementById('photo-filters');
  const count = document.getElementById('photo-count');
  let selected = 'all';
  const filter = () => {
    const photos = Array.from(gallery.querySelectorAll('.photo'));
    photos.forEach(link => { link.hidden = selected !== 'all' && (link.dataset.photoKind || 'club') !== selected; });
    gallery.classList.toggle('is-filtered', selected !== 'all');
    const visible = photos.filter(link => !link.hidden).length;
    if (count) count.textContent = selected === 'all' ? photos.length + ' фото' : visible + ' из ' + photos.length + ' фото';
    filters?.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.photoFilter === selected)));
  };
  if (filters) {
    filters.hidden = false;
    filters.addEventListener('click', event => {
      const button = event.target.closest('button[data-photo-filter]');
      if (!button) return;
      selected = button.dataset.photoFilter;
      filter();
    });
    new MutationObserver(filter).observe(gallery, { childList: true });
    filter();
  }

  const show = (position) => {
    index = (position + links.length) % links.length;
    const photo = links[index].querySelector('img');
    image.alt = photo.alt;
    image.src = links[index].href;
    description.textContent = photo.alt + ' · ' + (index + 1) + ' из ' + links.length;
  };

  gallery.addEventListener('click', (event) => {
    const link = event.target.closest('.photo');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    opener = link;
    links = Array.from(gallery.querySelectorAll('.photo')).filter(item => !item.hidden);
    previous.hidden = next.hidden = links.length < 2;
    show(links.indexOf(link));
    dialog.showModal();
  });
  previous.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      show(index + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    image.removeAttribute('src');
    opener?.focus();
  });
})();
