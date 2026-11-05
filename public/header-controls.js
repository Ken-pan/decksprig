/* Only existing public-header controls; no editor or language preference store. */
(() => {
  const icons = {"light": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" data-lucide=\"sun\"><g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"><circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41\"/></g></svg>", "dark": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" data-lucide=\"moon\"><path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401\"/></svg>", "system": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" data-lucide=\"sun-moon\"><path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M12 2v2m2.837 12.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715M16 12a4 4 0 0 0-4-4m7-3l-1.256 1.256M20 12h2\"/></svg>"};
  const zh = document.documentElement.lang.startsWith('zh');
  const labels = zh ? {light:'浅色',dark:'深色',system:'跟随系统'} : {light:'Light',dark:'Dark',system:'System'};
  const preferences = [...document.querySelectorAll('[data-header-preference]')];
  function close(details, restore = false) {
    details.open = false;
    if (restore) details.querySelector('summary').focus({preventScroll:true});
  }
  function syncAppearance() {
    const api = window.decksprigWebsiteAppearance;
    if (!api) return;
    const value = api.get();
    for (const details of preferences.filter(item => item.hasAttribute('data-appearance-control'))) {
      const trigger = details.querySelector('summary');
      trigger.setAttribute('aria-label', `${zh ? '外观' : 'Appearance'}: ${labels[value]}`);
      trigger.title = labels[value];
      details.querySelector('[data-theme-icon]').innerHTML = icons[value];
      for (const button of details.querySelectorAll('[data-appearance-choice]')) button.setAttribute('aria-pressed', String(button.dataset.appearanceChoice === value));
    }
  }
  function syncLocaleLinks() {
    for (const link of document.querySelectorAll('[data-header-locale]')) {
      const target = new URL(link.href);
      target.search = location.search; target.hash = location.hash;
      if (target.searchParams.has('lang')) target.searchParams.set('lang', link.lang.startsWith('zh') ? 'zh-Hans' : 'en');
      link.href = target.href;
    }
  }
  for (const details of preferences) {
    const trigger = details.querySelector('summary');
    const items = () => [...details.querySelectorAll('button,a[href]')];
    details.addEventListener('toggle', () => { if (details.open) for (const other of preferences) if (other !== details) close(other); });
    details.addEventListener('keydown', event => {
      if (event.key === 'Escape' && details.open) { event.preventDefault(); event.stopPropagation(); close(details,true); return; }
      if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
      event.preventDefault(); details.open = true;
      const choices = items(); if (!choices.length) return;
      const current = choices.indexOf(document.activeElement);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length-1 : event.key === 'ArrowUp' ? (current <= 0 ? choices.length-1 : current-1) : (current+1)%choices.length;
      choices[index].focus();
    });
    details.addEventListener('focusout', () => requestAnimationFrame(() => { if (!details.contains(document.activeElement)) close(details); }));
    for (const button of details.querySelectorAll('[data-appearance-choice]')) button.addEventListener('click', () => {
      window.decksprigWebsiteAppearance?.set(button.dataset.appearanceChoice);
      close(details,true);
    });
    trigger.addEventListener('click', syncLocaleLinks);
  }
  document.addEventListener('pointerdown', event => { for (const details of preferences) if (!details.contains(event.target)) close(details); });
  addEventListener('decksprigappearancechange', syncAppearance);
  addEventListener('hashchange', syncLocaleLinks); addEventListener('popstate', syncLocaleLinks);
  syncAppearance(); syncLocaleLinks();
})();
