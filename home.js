(() => {
  const gallery = document.getElementById('hero-photos');
  if (!gallery) return;

  const slides = Array.from(gallery.querySelectorAll('.hero-slide'));
  const controls = gallery.querySelector('.hero-photo-controls');
  const [previous, next] = controls.querySelectorAll('button');
  const count = controls.querySelector('.hero-photo-count');
  let current = 0;
  const show = (index) => {
    slides[current].hidden = true;
    current = (index + slides.length) % slides.length;
    const slide = slides[current];
    slide.querySelector('img').loading = 'eager';
    slide.hidden = false;
    count.textContent = (current + 1) + ' / ' + slides.length;
  };

  previous.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current + 1));
  count.textContent = '1 / ' + slides.length;
  controls.hidden = false;
})();

(() => {
  const table = document.querySelector('.table-art');
  if (!table || !('IntersectionObserver' in window) ||
      !window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;

  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    table.classList.add('is-playing');
    observer.disconnect();
  }, { threshold: 0.4 });
  observer.observe(table);
})();
