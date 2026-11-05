type StartupOptions = {
  activeId: string | null;
  open: (id: string) => Promise<void>;
};

// The default entry shows the chooser, even when documents already exist.
// Resource deep links may resume the last document; document links are explicit.
export function workspaceEntryId(search: string, previousId: string | null): string | null {
  const params = new URLSearchParams(search);
  if (params.has('document')) return params.get('document') || null;
  return ['blue-black', 'characters', 'deck-graphics'].includes(params.get('library') || '') ? previousId : null;
}

// A template link creates a new document; an explicit document link wins.
export function workspaceTemplateId(search: string, templates: readonly string[]): string | null {
  const params = new URLSearchParams(search);
  const id = params.get('template');
  return id && !params.has('document') && templates.includes(id) ? id : null;
}

export function workspaceDocumentURL(href: string, id: string): string {
  const url = new URL(href);
  url.searchParams.set('document', id);
  return url.pathname + url.search + url.hash;
}

// Missing documents return to the chooser. Conflicts and unreadable drafts
// must never cause an automatic switch to another document.
export async function initializeWorkspace({activeId, open}: StartupOptions): Promise<void> {
  if (activeId) {
    try { await open(activeId); return; }
    catch (error) { if ((error as {status?: number}).status !== 404) throw error; }
  }
}
