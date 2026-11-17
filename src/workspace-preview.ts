/** Critical feedback moves workspace scrolling into the surrounding body. */
export function revealWorkspacePreview(workspace:HTMLElement|undefined){
  if(!workspace)return;
  const body=workspace.closest<HTMLElement>('.modal-body');
  const scroller=body&&getComputedStyle(body).overflowY==='auto'?body:workspace;
  scroller.scrollTo({top:scroller===workspace?0:scroller.scrollTop+workspace.getBoundingClientRect().top-scroller.getBoundingClientRect().top});
  workspace.querySelector<HTMLElement>('[data-workspace-preview]')?.focus({preventScroll:true});
}
