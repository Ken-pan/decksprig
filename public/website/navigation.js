/* Initialize the header before main content to avoid a mobile layout shift. */
(() => {
  const header=document.querySelector('.nav');
  const menu = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('#navigation');
  header.setAttribute('data-menu-ready', '');
  const headerSize = new ResizeObserver(([entry]) => {
    const height = entry.borderBoxSize?.[0]?.blockSize ?? header.getBoundingClientRect().height;
    header.style.setProperty('--ktb-header-height', `${height}px`);
  });
  headerSize.observe(header);
  function setMenu(open) {
    navigation.classList.toggle('open', open);
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    menu.querySelector('use').setAttribute('href', open ? '#close' : '#menu');
    if (open) navigation.querySelector('a').focus();
  }
  menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
  navigation.addEventListener('click', e => {
    const link = e.target.closest('a');
    if (!link) return;
    const wasOpen = menu.getAttribute('aria-expanded') === 'true';
    setMenu(false);
    if (wasOpen && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      const section = link.hash && link.origin === location.origin && link.pathname === location.pathname ? document.querySelector(link.hash) : null;
      const heading = section?.querySelector('h2');
      if (heading) {
        e.preventDefault();
        if (location.hash !== link.hash) history.pushState(null, '', link.hash);
        section.scrollIntoView({block: 'start'});
        heading.tabIndex = -1;
        heading.focus({preventScroll: true});
      }
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { setMenu(false); menu.focus(); } });
  matchMedia('(min-width: 901px)').addEventListener('change', e => { if (e.matches) { const restore = document.activeElement === menu; setMenu(false); if (restore) header.querySelector('.brand').focus({preventScroll:true}); } });

  document.addEventListener('pointerdown', event => {
    if (menu.getAttribute('aria-expanded') === 'true' && !header.contains(event.target)) {
      const restore = navigation.contains(document.activeElement);
      setMenu(false);
      if (restore) menu.focus({preventScroll:true});
    }
  });
  header.addEventListener('focusout', event => {
    if (event.relatedTarget instanceof Node && header.contains(event.relatedTarget)) return;
    requestAnimationFrame(() => { if (!header.contains(document.activeElement) && menu.getAttribute('aria-expanded') === 'true') setMenu(false); });
  });

})();
