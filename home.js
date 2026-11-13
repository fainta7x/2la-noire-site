(() => {
  const gallery = document.getElementById('hero-photos');
  if (!gallery) return;

  const slides = Array.from(gallery.querySelectorAll('.hero-slide'));
  const dots = Array.from(document.querySelectorAll('.hero-dots button'));
  if (slides.length < 2) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const INTERVAL = 5500;
  let current = 0;
  let timer = 0;

  const show = (index) => {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, position) => {
      const active = position === current;
      slide.classList.toggle('is-active', active);
      if (active) slide.querySelector('img').loading = 'eager';
    });
    dots.forEach((dot, position) => {
      if (position === current) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  };
  const stop = () => { window.clearInterval(timer); timer = 0; };
  const start = () => {
    stop();
    if (!reduceMotion.matches && !document.hidden) timer = window.setInterval(() => show(current + 1), INTERVAL);
  };

  dots.forEach((dot, position) => dot.addEventListener('click', () => { show(position); start(); }));
  document.addEventListener('visibilitychange', start);
  reduceMotion.addEventListener('change', start);
  start();

  const chapterLinks = Array.from(document.querySelectorAll('.chapter-nav a[href^="#"]'));
  const chapterSections = chapterLinks.map((link) => ({
    link, section: document.querySelector(link.getAttribute('href'))
  })).filter(({ section }) => section);
  const progress = document.querySelector('.chapter-progress');
  let scrollPending = false;
  const updateChapter = () => {
    scrollPending = false;
    const offset = window.innerHeight * .35;
    let active = null;
    for (const item of chapterSections) {
      if (item.section.getBoundingClientRect().top <= offset) active = item;
    }
    chapterLinks.forEach((link) => {
      if (active?.link === link) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    if (progress) {
      const available = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const fraction = Math.min(1, Math.max(0, window.scrollY / available));
      progress.style.transform = 'scaleX(' + fraction + ')';
    }
  };
  const scheduleScroll = () => {
    if (scrollPending) return;
    scrollPending = true;
    window.requestAnimationFrame(updateChapter);
  };
  window.addEventListener('scroll', scheduleScroll, { passive: true });
  window.addEventListener('resize', scheduleScroll, { passive: true });
  updateChapter();
})();
