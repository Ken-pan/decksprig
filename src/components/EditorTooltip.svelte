<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { isPointerGestureActive } from '../pointer-cursor';

  let bubble: HTMLDivElement;
  let label = $state(''), visible = $state(false), x = $state(0), y = $state(0);
  const id = `editor-tooltip-${Math.random().toString(36).slice(2)}`;

  onMount(() => {
    let disposed = false;
    let anchor: HTMLElement | null = null;
    let showTimer: ReturnType<typeof setTimeout>, hideTimer: ReturnType<typeof setTimeout>;
    let oldDescription: string | null = null;
    let pointerHeld = false, hoverPoint: {x: number; y: number} | null = null;
    let overBubble = false, bubbleBounds: {left:number;right:number;top:number;bottom:number} | undefined;
    const names = new WeakMap<HTMLElement, string>();
    function hasVisibleText(el: HTMLElement) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (!/[\p{L}\p{N}]/u.test(node.textContent ?? '') || !parent || parent.closest('svg,.sr-only,[aria-hidden="true"]')) continue;
        const style = getComputedStyle(parent);
        if (style.visibility !== 'visible' || style.clipPath === 'inset(50%)') continue;
        const range = document.createRange(); range.selectNodeContents(node);
        if (Array.from(range.getClientRects()).some(rect => rect.width > 0 && rect.height > 0)) return true;
      }
      return false;
    }
    function name(el: HTMLElement) {
      if (el.closest('.number-property') || hasVisibleText(el)) return '';
      const text = el.dataset.tooltip || el.getAttribute('aria-label') || names.get(el) || '';
      return text.split(/\s*·\s*|\n|:\s*/)[0].trim();
    }
    function prepareButton(el: HTMLElement) {
      const title = el.getAttribute('title');
      if (title) {
        // Preserve a title-only icon's accessible name before removing native help.
        names.set(el, title);
        if (!el.hasAttribute('aria-label') && !hasVisibleText(el)) el.setAttribute('aria-label', title);
        el.removeAttribute('title');
      }
      // Captions inside a labelled button must not create a second native tooltip.
      for (const child of el.querySelectorAll('[title]')) child.removeAttribute('title');
    }
    function hide() {
      clearTimeout(showTimer); clearTimeout(hideTimer); overBubble=false; bubbleBounds=undefined; if (!disposed) visible = false;
      if (bubble.matches(':popover-open')) bubble.hidePopover();
      if (anchor) { if (oldDescription === null) anchor.removeAttribute('aria-describedby'); else anchor.setAttribute('aria-describedby', oldDescription); }
      document.body.append(bubble);
      anchor = null;
    }
    function deferHide() { clearTimeout(showTimer); clearTimeout(hideTimer); hideTimer = setTimeout(hide, 160); }
    function target(event: Event) {
      const el = event.target instanceof Element ? event.target.closest<HTMLElement>('button') : null;
      if (el) prepareButton(el);
      return el && name(el) ? el : null;
    }
    function prepareTitles(root: ParentNode) {
      for (const el of root.querySelectorAll<HTMLElement>('button[title]')) {
        prepareButton(el);
      }
      for (const el of root.querySelectorAll<HTMLElement>('button [title]')) el.removeAttribute('title');
    }
    prepareTitles(document);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof HTMLElement && record.target.hasAttribute('title')) {
          const button = record.target.closest<HTMLElement>('button'); if (button) prepareButton(button);
        }
        for (const node of record.addedNodes) if (node instanceof Element) { const button = node.closest<HTMLElement>('button'); if (button) prepareButton(button); prepareTitles(node); }
      }
    });
    observer.observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: ['title']});
    async function show(el: HTMLElement) {
      if (!el.isConnected || anchor !== el) return;
      if (document.querySelector('[data-context-menu]:popover-open')) { hide(); return; }
      if (pointerHeld || isPointerGestureActive()) { hide(); return; }
      label = name(el);
      if (!label) { hide(); return; }
      // Native dialogs and popovers own the top layer; follow the current trigger there.
      (el.closest('dialog[open], [popover]:popover-open') || document.body).append(bubble);
      visible = true;
      await tick();
      if (anchor !== el) return;
      bubble.showPopover();
      const r = el.getBoundingClientRect(), b = bubble.getBoundingClientRect();
      x = Math.max(8, Math.min(innerWidth - b.width - 8, r.left + r.width / 2 - b.width / 2));
      y = r.bottom + b.height + 10 <= innerHeight ? r.bottom + 6 : Math.max(8, r.top - b.height - 6);
      bubbleBounds={left:x,right:x+b.width,top:y,bottom:y+b.height};
      el.setAttribute('aria-describedby', [oldDescription, id].filter(Boolean).join(' '));
    }
    function schedule(el: HTMLElement, delay: number) {
      if (pointerHeld || isPointerGestureActive() || document.querySelector('[data-context-menu]:popover-open')) return;
      clearTimeout(hideTimer);
      if (anchor === el) return;
      hide(); anchor = el; oldDescription = el.getAttribute('aria-describedby'); showTimer = setTimeout(() => void show(el), delay);
    }
    function track(event: PointerEvent) {
      if(event.pointerType==='touch')return;
      hoverPoint={x:event.clientX,y:event.clientY};
      const within=visible&&bubbleBounds&&event.clientX>=bubbleBounds.left&&event.clientX<=bubbleBounds.right&&event.clientY>=bubbleBounds.top&&event.clientY<=bubbleBounds.bottom;
      if(within){overBubble=true;clearTimeout(hideTimer);}
      else if(overBubble){overBubble=false;if(!anchor?.matches(':focus-visible'))deferHide();}
    }
    function over(event: PointerEvent) { if (event.pointerType === 'touch') return; track(event); if(overBubble)return; const el = target(event); if (el && !event.buttons) schedule(el, 450); }
    function out(event: PointerEvent) { if (anchor && event.target instanceof Node && anchor.contains(event.target) && (!(event.relatedTarget instanceof Node) || !anchor.contains(event.relatedTarget))) deferHide(); }
    // Native focus events also fire while Svelte removes or restores controls.
    // Update tooltip state after that render, and ignore superseded anchors.
    function focus(event: FocusEvent) {
      const el = target(event);
      queueMicrotask(() => { if (!disposed && el?.isConnected && document.activeElement === el && el.matches(':focus-visible')) schedule(el, 150); });
    }
    function blur(event: FocusEvent) {
      const previous = anchor;
      if (previous && event.target === previous) queueMicrotask(() => { if (!disposed && anchor === previous) hide(); });
    }
    function key(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.key !== 'Escape' || !visible) return;
      hide();
      if (document.querySelector('[data-context-menu]:popover-open')) return;
      // Modal/popover owners and fields receive the same Escape after help hides.
      if (event.target instanceof HTMLElement && event.target.closest('dialog:modal,[popover]:popover-open:not([role="tooltip"]),input,textarea,select,[contenteditable="true"]')) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }
    function resumeHover() {
      if (!hoverPoint || pointerHeld || isPointerGestureActive()) return;
      const el = document.elementFromPoint(hoverPoint.x, hoverPoint.y)?.closest<HTMLElement>('button');
      if (el && name(el)) schedule(el, 450);
    }
    function beginPress(event: PointerEvent) { pointerHeld = true; if (event.pointerType === 'touch') hoverPoint = null; hide(); }
    function endPress() { pointerHeld = false; resumeHover(); }
    function beginDrag() { pointerHeld = true; hide(); }
    function trackDrag(event: DragEvent) { if (hoverPoint) hoverPoint = {x: event.clientX, y: event.clientY}; hide(); }
    function endDrag() { pointerHeld = false; hide(); void tick().then(resumeHover); }
    function loseWindow() { pointerHeld = false; hoverPoint = null; hide(); }
    const gestureObserver = new MutationObserver(() => { if (isPointerGestureActive()) hide(); else resumeHover(); });
    gestureObserver.observe(document.documentElement, {attributes: true, attributeFilter: ['data-pointer-cursor']});
    // Keep noninteractive help hoverable without intercepting the control beneath it.
    // The help layer is loaded on demand; include the hover/focus that loaded it.
    const focused = document.activeElement;
    const hovered = document.querySelector<HTMLElement>('button:hover');
    if (focused instanceof HTMLElement && focused.matches('button:focus-visible') && name(focused)) schedule(focused, 150);
    else if (hovered && name(hovered)) schedule(hovered, 450);
    
    document.addEventListener('pointerover', over); document.addEventListener('pointerout', out);
    document.addEventListener('focusin', focus); document.addEventListener('focusout', blur);
    document.addEventListener('pointermove', track, true);
    document.addEventListener('pointerdown', beginPress, true); document.addEventListener('pointerup', endPress, true); document.addEventListener('pointercancel', endPress, true);
    document.addEventListener('dragstart', beginDrag, true); document.addEventListener('dragover', trackDrag, true); document.addEventListener('dragend', endDrag, true); document.addEventListener('drop', endDrag, true);
    window.addEventListener('blur', loseWindow); document.addEventListener('keydown', key, true);
    document.addEventListener('scroll', hide, true); window.addEventListener('resize', hide);
    return () => {
      disposed = true;
      hide(); observer.disconnect(); gestureObserver.disconnect(); bubble.remove();
      document.removeEventListener('pointerover', over); document.removeEventListener('pointerout', out);
      document.removeEventListener('focusin', focus); document.removeEventListener('focusout', blur);
      document.removeEventListener('pointermove', track, true);
      document.removeEventListener('pointerdown', beginPress, true); document.removeEventListener('pointerup', endPress, true); document.removeEventListener('pointercancel', endPress, true);
      document.removeEventListener('dragstart', beginDrag, true); document.removeEventListener('dragover', trackDrag, true); document.removeEventListener('dragend', endDrag, true); document.removeEventListener('drop', endDrag, true);
      window.removeEventListener('blur', loseWindow); document.removeEventListener('keydown', key, true);
      document.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide);
    };
  });
</script>

<div bind:this={bubble} {id} popover="manual" role="tooltip" class="editor-tooltip" class:visible style:left="{x}px" style:top="{y}px" aria-hidden={!visible}>{label}</div>

<style>
  .editor-tooltip{position:fixed;inset:auto;margin:0;z-index:200;max-width:min(280px,calc(100vw - 16px));padding:8px 12px;border-radius:var(--r-sm);border:1px solid var(--tooltip-border);background:var(--tooltip-surface);color:var(--tooltip-text);box-shadow:var(--shadow-md);font:var(--ui-meta)/1.5 var(--font-ui);letter-spacing:normal;visibility:hidden;opacity:0;pointer-events:none;transition:opacity var(--ui-motion-feedback) ease,translate var(--ui-motion-feedback) var(--ui-ease-out),visibility 0s var(--ui-motion-feedback);translate:0 3px;white-space:pre-wrap}
  .editor-tooltip.visible{visibility:visible;opacity:1;pointer-events:none;translate:0 0;transition-delay:0s}
  @media(prefers-reduced-motion:reduce){.editor-tooltip{transition:none}}
  @media print{.editor-tooltip{display:none}}
</style>
