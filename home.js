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

  // Progressive disclosure: nothing is hidden until the observer has been installed.
  // IntersectionObserver avoids per-element scroll listeners and does not affect link navigation.
  const motionItems = [];
  document.querySelectorAll('[data-motion-section]').forEach((section) => {
    const candidates = [
      section.querySelector('.section-kicker'),
      section.querySelector('h2'),
      section.querySelector('.section-copy'),
      section.querySelector('.intro-image'),
      section.querySelector('.sport-photo'),
      section.querySelector('.journey-visual'),
      section.querySelector('.place-story > img'),
      ...section.querySelectorAll('.club-path-grid article, .player-paths > div, .editorial-gallery .photo-preview')
    ].filter(Boolean);
    candidates.forEach((node, index) => {
      node.classList.add('motion-enter');
      node.style.setProperty('--enter-delay', Math.min(index, 3) * 75 + 'ms');
      motionItems.push(node);
    });
  });

  if (!reduceMotion.matches && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('motion-visible');
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px 32px 0px', threshold: 0.08 });
    motionItems.forEach((node) => observer.observe(node));
    document.body.classList.add('motion-enabled');
    // Also reveal everything in-page when returning via browser history.
    motionItems.filter((node) => node.getBoundingClientRect().top < innerHeight &&
      node.getBoundingClientRect().bottom > 0).forEach((node) => node.classList.add('motion-visible'));
  } else {
    motionItems.forEach((node) => node.classList.add('motion-visible'));
  }

  // An active stage follows the reading position: the layout stays stable
  // and content remains readable before, during, and after the animation.
  const makeActive = (selector, itemSelector) => {
    const root = document.querySelector(selector);
    if (!root) return () => {};
    const items = Array.from(root.querySelectorAll(itemSelector));
    return () => {
      const point = innerHeight * .65;
      let index = 0;
      items.forEach((item, i) => {
        if (item.getBoundingClientRect().top < point) index = i;
      });
      items.forEach((item, i) => item.classList.toggle('is-current', i === index));
    };
  };
  const highlightSteps = makeActive('[data-game-steps]', 'li');
  const highlightJourney = makeActive('[data-journey]', 'article');
  const journeyVisual = document.querySelector('[data-journey-visual]');
  const journeySlides = journeyVisual ? Array.from(journeyVisual.querySelectorAll('.journey-shot')) : [];
  const journeyCaption = journeyVisual?.querySelector('.journey-caption');
  const journeyCounter = journeyVisual?.querySelector('.journey-counter');
  const journeyCards = Array.from(document.querySelectorAll('[data-journey] article'));
  const journeyLabels = ['Первая игра', 'Клубные встречи', 'Турниры'];
  let journeyIndex = -1;
  const syncJourneyPhoto = () => {
    if (!journeySlides.length || !journeyCards.length) return;
    const currentIndex = Math.max(0, journeyCards.findIndex(card => card.classList.contains('is-current')));
    if (journeyIndex === currentIndex) return;
    journeyIndex = currentIndex;
    journeySlides.forEach((shot, i) => shot.classList.toggle('is-active', i === currentIndex));
    if (journeyCaption) journeyCaption.textContent = journeyLabels[currentIndex];
    if (journeyCounter) journeyCounter.textContent = String(currentIndex + 1).padStart(2, '0') + ' / 03';
  };
  const motionPhotos = Array.from(document.querySelectorAll('.motion-photo, .motion-place-photo'));
  let motionFrame = false;
  const syncMotion = () => {
    motionFrame = false;
    highlightSteps();
    highlightJourney();
    syncJourneyPhoto();
    if (reduceMotion.matches) {
      motionPhotos.forEach((node) => node.style.removeProperty('--photo-shift'));
      return;
    }
    // Small bounded image-only parallax: no layout or hit-target movement.
    for (const wrapper of motionPhotos) {
      const rect = wrapper.getBoundingClientRect();
      const shift = Math.max(-24, Math.min(24, (innerHeight / 2 - (rect.top + rect.height / 2)) * .055));
      wrapper.style.setProperty('--photo-shift', shift.toFixed(1) + 'px');
    }
  };
  const requestMotion = () => {
    if (motionFrame) return;
    motionFrame = true;
    requestAnimationFrame(syncMotion);
  };
  window.addEventListener('scroll', requestMotion, { passive: true });
  window.addEventListener('resize', requestMotion, { passive: true });
  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) {
      document.body.classList.remove('motion-enabled');
      motionItems.forEach((node) => node.classList.add('motion-visible'));
    }
    requestMotion();
  });
  syncMotion();
})();
