/* Public website preferences; never reads editor settings or document data. */
(() => {
  const key = 'deck-studio-website-theme';
  const root = document.documentElement;
  const system = matchMedia('(prefers-color-scheme: dark)');
  const normalize = value => value === 'light' || value === 'dark' ? value : 'system';
  let preferred = 'system';
  try { preferred = normalize(localStorage.getItem(key)); } catch {}
  function apply() {
    root.dataset.theme = preferred === 'system' ? system.matches ? 'dark' : 'light' : preferred;
    root.dataset.appearance = preferred;
    dispatchEvent(new CustomEvent('decksprigappearancechange'));
  }
  window.decksprigWebsiteAppearance = {
    get: () => preferred,
    set(value) {
      preferred = normalize(value);
      try { if (preferred === 'system') localStorage.removeItem(key); else localStorage.setItem(key, preferred); } catch {}
      apply();
    }
  };
  system.addEventListener('change', () => { if (preferred === 'system') apply(); });
  addEventListener('storage', event => { if (event.key === key || event.key === null) { try { preferred = normalize(localStorage.getItem(key)); } catch {} apply(); } });
  apply();
})();
