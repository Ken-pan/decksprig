/* Independent marketing-page state; never uses editor storage or document APIs. */
(() => {
  const root = document.documentElement;
  function syncAppearance() {
    const dark = root.dataset.theme === 'dark';
    root.classList.add('theme-changing');
    document.querySelector('[data-dark-shot]').media = dark ? 'all' : 'not all';
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-changing')));
  }
  syncAppearance();
  addEventListener('decksprigappearancechange', syncAppearance);
  const header = document.querySelector('.nav');
  const hero = document.querySelector('.hero');
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const editorSlot = document.querySelector('.nav-editor-slot');
  const heroAction = document.querySelector('.hero-copy .button.primary');
  let editorVisible;
  let overHero;
  let headerFramePending = false;
  function updateHeader() {
    headerFramePending = false;
    const headerBottom = header.getBoundingClientRect().bottom;
    // The header shares the hero's graphite tone until the hero scrolls beneath it.
    const onHero = hero.getBoundingClientRect().bottom > headerBottom;
    if (onHero !== overHero) {
      overHero = onHero;
      if (onHero) header.dataset.tone = 'hero'; else delete header.dataset.tone;
      themeColor.content = onHero ? '#0b0c0f' : getComputedStyle(header).getPropertyValue('--page').trim();
    }
    const gap = heroAction.getBoundingClientRect().bottom - headerBottom;
    // A small return band keeps trackpad reversals from flashing the action.
    const visible = editorVisible ? gap < 24 : gap <= 0;
    if (visible === editorVisible) return;
    editorVisible = visible;
    root.classList.toggle('nav-cta-visible', visible);
    editorSlot.inert = !visible;
    editorSlot.setAttribute('aria-hidden', String(!visible));
    if (!visible && editorSlot.contains(document.activeElement)) heroAction.focus({preventScroll: true});
  }
  function scheduleHeader() {
    if (headerFramePending) return;
    headerFramePending = true;
    requestAnimationFrame(updateHeader);
  }
  updateHeader();
  addEventListener('scroll', scheduleHeader, {passive: true});
  addEventListener('resize', scheduleHeader);
  addEventListener('decksprigappearancechange', () => { overHero = undefined; scheduleHeader(); });
  document.fonts.ready.then(scheduleHeader);

  if ('IntersectionObserver' in window) {
    const sections = [...document.querySelectorAll('.reveal')];
    sections.forEach(section => { if (section.getBoundingClientRect().top < innerHeight + 48) section.classList.add('seen'); });
    root.classList.add('js-ready');
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('seen'); observer.unobserve(entry.target); } }), {threshold: 0, rootMargin: '0px 0px 48px 0px'});
    sections.filter(section => !section.classList.contains('seen')).forEach(section => observer.observe(section));
  }
})();
