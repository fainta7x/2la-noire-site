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
    links = Array.from(gallery.querySelectorAll('.photo'));
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
