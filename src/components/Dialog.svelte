<script lang="ts">
  import { onMount, getContext, setContext, type Snippet } from 'svelte';
  import { uiPresence, uiChange } from '../ui-motion';
  import DialogHeader from './ui/DialogHeader.svelte';
  import { restoreFocus } from '../ui-focus';
  import { modalFocus } from '../ui-modal-focus';
  import NotificationOutlet from './NotificationOutlet.svelte';
  import { registerNotificationDialog } from '../notification-ui.svelte';
  let {title, onclose, returnFocus, children, footer, subtitle, descriptionId, wide = false, resource = false, review = false, workspace = false, closeLabel = 'Close', element = $bindable(), class: className = ''}: {title: string; onclose: () => void; returnFocus?: () => HTMLElement | undefined; children: Snippet; footer?: Snippet; subtitle?: string; descriptionId?: string; wide?: boolean; resource?: boolean; review?: boolean; workspace?: boolean; closeLabel?: string; element?: HTMLDialogElement; class?: string} = $props();
  const featureReturnFocus=getContext<(()=>HTMLElement|null)|undefined>('deck-studio-feature-focus');
  setContext('deck-studio-feature-focus',undefined);
  const returnTarget=()=>returnFocus?.()??featureReturnFocus?.()??undefined;
  const titleId = $props.id();
  let heading = $state<HTMLHeadingElement>();
  let body: HTMLDivElement;
  let scrollable=$state(false);
  let focusOrigin:HTMLElement|null=null;
  let releaseFeedback: (() => void) | undefined;
  function releaseModal(){if(element?.open){releaseFeedback?.();releaseFeedback=undefined;element.close();restoreFocus(returnTarget(),focusOrigin);}}
  function modalPresence(node:HTMLElement,params:Parameters<typeof uiPresence>[1],options:Parameters<typeof uiPresence>[2]) {
    const config=uiPresence(node,params,options);
    if(typeof config!=='function')return config;
    return (phase:{direction?:'in'|'out'}={})=>{
      if(phase.direction==='out')releaseModal();
      else if(element && !element.open){focusOrigin=document.activeElement as HTMLElement|null;element.showModal();releaseFeedback??=registerNotificationDialog(element);focusContent();}
      return config(phase);
    };
  }
  let previousTitle = '', focusFrame = 0;
  function focusContent() {
    cancelAnimationFrame(focusFrame);
    focusFrame = requestAnimationFrame(() => {
      if (!element?.open || element.dataset.uiLeaving === 'true') return;
      (element.querySelector<HTMLElement>('[data-dialog-autofocus]') ?? heading)?.focus({preventScroll: true});
    });
  }
  $effect(() => {
    const next = title;
    if (next === previousTitle || !body) return;
    previousTitle = next;
    body.scrollTop = 0;
    if (element?.open) focusContent();
  });
  onMount(() => {
    const current = element!, origin = document.activeElement as HTMLElement | null;focusOrigin=origin;
    const measure=()=>scrollable=body.scrollHeight>body.clientHeight+1;
    let revealFrame=0;
    const reveal=()=>{measure();cancelAnimationFrame(revealFrame);revealFrame=requestAnimationFrame(()=>{
      const active=document.activeElement;
      // Keep the focused control in view when the keyboard shrinks the body.
      if(current.open&&active instanceof HTMLElement&&active!==body&&body.contains(active)&&!active.closest('[popover]:popover-open'))active.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    });},resize=new ResizeObserver(reveal), content=new MutationObserver(records=>{
      // Body/feedback changes can replace the scrolling surface. Ordinary
      // descendant updates must not undo an intentional scroll elsewhere.
      const changed=records.some(({target})=>target===body||(target instanceof Element?target:target.parentElement)?.closest('.notification-feedback,.notification-fallback')?.parentElement===body);
      if(changed)reveal();else measure();
    });
    body.addEventListener('focusin',reveal);
    resize.observe(body);content.observe(body,{childList:true,subtree:true,characterData:true});
    current.showModal(); releaseFeedback??=registerNotificationDialog(current); focusContent();measure();
    return () => {
      body.removeEventListener('focusin',reveal);resize.disconnect();content.disconnect();cancelAnimationFrame(revealFrame);cancelAnimationFrame(focusFrame); releaseFeedback?.();releaseFeedback=undefined; const wasOpen=current.open;current.close();
      if(!wasOpen)return;
      queueMicrotask(() => {
        if (document.querySelector('dialog:modal')) return;
        const requested = returnTarget();
        restoreFocus(requested, origin);
      });
    };
  });
</script>
<dialog bind:this={element} use:modalFocus={returnTarget} aria-modal="true" transition:modalPresence={{y: 8, surface: true}} class="modal {className}" class:wide class:review class:resource-modal={resource} class:dialog-workspace={workspace} aria-labelledby={titleId} aria-describedby={descriptionId} onkeydown={event => { if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing && event.keyCode !== 229 && event.target instanceof Element && event.target.closest('dialog') === element && !event.target.closest('[popover]:popover-open:not([role="tooltip"])')) { event.preventDefault(); event.stopPropagation(); onclose(); } }} oncancel={(e) => { e.preventDefault(); onclose(); }}>
  <DialogHeader {title} {subtitle} {titleId} {closeLabel} {onclose} bind:heading />
  <!-- Scrollable dialog prose has a keyboard reading position. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div tabindex={scrollable?0:undefined} role={scrollable?'region':undefined} aria-label={scrollable?`${title} content`:undefined} class="modal-body" class:dialog-workspace-body={workspace} bind:this={body} use:uiChange={title}><NotificationOutlet kind="feedback" owner={element}/>{@render children()}</div>
  <NotificationOutlet kind="toast" owner={element}/>
  {#if footer}{@render footer()}{/if}
</dialog>
