/* Guide language belongs to its reading route; editor settings remain independent. */
(() => {
  function updateLinks() {
    for (const link of document.querySelectorAll('[data-guide-locale]')) {
      const target = new URL(link.href);
      target.search = location.search;
      target.hash = location.hash;
      if (target.searchParams.has('lang')) target.searchParams.set('lang', link.lang.startsWith('zh') ? 'zh-Hans' : 'en');
      link.href = target.href;
    }
    const family = document.querySelector('[data-footer-toolbox]');
    if (family) family.href = 'https://kens-toolbox.com/?lang=' + (document.documentElement.lang.startsWith('zh') ? 'zh-Hans' : 'en');
  }
  updateLinks();
  addEventListener('hashchange', updateLinks);
  addEventListener('popstate', updateLinks);
})();
