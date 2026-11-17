<script lang="ts">
  import '../document-library.css';
  import { Copy, Ellipsis, FileText, Plus, Search, Upload, X, ChevronDown, HardDrive } from '@lucide/svelte';
  import { Button, ActionMenu, SegmentedControl , EmptyState} from './ui';
  import BrandLockup from './BrandLockup.svelte';
  import LibraryPreview from './LibraryPreview.svelte';
  import LibraryDocumentFiles from './LibraryDocumentFiles.svelte';
  import {LibraryPreviewQueue} from '../core/library-preview-queue';
  const previewQueue = new LibraryPreviewQueue();
  import { isBrowserEdition } from '../core/runtime';
  import { countLabel } from '../core/ui-copy';
  import { libraryDocuments, libraryDate, type LibraryDocument, type LibrarySort } from '../core/document-library-view';

  let { documents, currentId, busy='', onopen, onrename, onduplicate, onimport, oncreate }: {
    documents: LibraryDocument[];
    currentId?: string;
    busy?: string;
    onopen: (id: string) => void;
    onrename: (id: string, title: string) => void;
    onduplicate: (id: string) => void;
    onimport: () => void;
    oncreate: () => void;
  } = $props();
  let query = $state(''), view = $state('grid'), sort = $state<LibrarySort>('recent');
  let searchInput = $state<HTMLInputElement>();
  const visible = $derived(libraryDocuments(documents, query, sort));
</script>

<div class="document-library">
  <div class="doc-library-heading">
    <BrandLockup caption={isBrowserEdition ? 'Browser workspace' : 'Local workspace'} />
    {#if documents.length}<div class="doc-library-actions">
      <Button variant="secondary" aria-label="Import document" onclick={onimport}><Upload size={16} />Import</Button>
      <Button variant="primary" aria-label="New document" onclick={oncreate}><Plus size={16} /><span class="doc-library-full-label">New document</span><span class="doc-library-short-label">New</span></Button>
    </div>{/if}
  </div>

  {#if documents.length}<div class="doc-library-toolbar">
    <div class="doc-library-search">
      <Search size={16} aria-hidden="true" />
      <input bind:this={searchInput} type="search" aria-label="Search documents" bind:value={query} placeholder="Search documents…" />
      {#if query}<Button kind="icon" size="sm" aria-label="Clear search" onclick={() => {query = ''; searchInput?.focus();}}><X size={14} /></Button>{/if}
    </div>
    <ActionMenu label="Sort documents" items={[
      {label: 'Recently edited', checked: sort === 'recent', onselect: () => sort = 'recent'},
      {label: 'Oldest first', checked: sort === 'oldest', onselect: () => sort = 'oldest'},
      {label: 'Title', checked: sort === 'title', onselect: () => sort = 'title'},
    ]}>{sort === 'recent' ? 'Recently edited' : sort === 'oldest' ? 'Oldest first' : 'Title'}</ActionMenu>
    <SegmentedControl label="Document view" options={[{value:'grid', label:'Grid', ariaLabel:'Grid view'}, {value:'list', label:'List', ariaLabel:'List view'}]} bind:value={view} />
  </div>

  <div class="doc-library-section">
    <h3>{query.trim() ? 'Search results' : 'Your documents'}</h3>
    <span role="status">{busy || (query.trim() ? `${visible.length} of ${countLabel(documents.length, 'document')}` : countLabel(documents.length, 'document'))}</span>
  </div>{/if}

  {#if visible.length}
    <LibraryDocumentFiles documents={visible} {view}>
      {#snippet card(document:LibraryDocument,index:number,tabIndex:number)}
        <div class="doc-library-file" data-deck-id={document.id} data-current={currentId === document.id} role="listitem" aria-posinset={index+1} aria-setsize={visible.length}>
          <button class="doc-library-open" tabindex={tabIndex} title={document.title} onclick={() => onopen(document.id)}>
            <LibraryPreview {document} queue={previewQueue} />
            <span class="sr-only">Open document: </span><span class="doc-library-info">
              <strong>{document.title}</strong>
              <span class="doc-library-meta"><span>{countLabel(document.count, 'slide')}{#if currentId === document.id}<span class="doc-library-current"> · Open</span>{/if}</span><time datetime={document.updatedAt} title={`Last edited ${new Date(document.updatedAt).toLocaleString('en-US')}`}>{libraryDate(document.updatedAt)}</time></span>
            </span>
          </button>
          <ActionMenu label={`Document actions: ${document.title}`} iconOnly items={[
            {label:'Rename', disabled:Boolean(busy), onselect:() => onrename(document.id, document.title)},
            {label:'Duplicate document', icon:Copy, disabled:Boolean(busy), onselect:() => onduplicate(document.id)},
          ]}><Ellipsis size={16} /></ActionMenu>
        </div>
      {/snippet}
    </LibraryDocumentFiles>
  {:else}
    {#if query.trim()}
      <EmptyState icon={Search} title="No matching documents" description="Try another title or clear your search."><Button variant="secondary" onclick={() => {query = ''; searchInput?.focus();}}>Clear search</Button></EmptyState>
    {:else}
      <EmptyState icon={FileText} title="Create your first document" ><Button variant="primary" onclick={oncreate}><Plus size={16} />New document</Button><Button variant="secondary" onclick={onimport}><Upload size={16} />Import document</Button></EmptyState>
    {/if}
  {/if}

  <details class="doc-library-storage">
    <summary><HardDrive size={14} aria-hidden="true" />{isBrowserEdition ? 'Saved in this browser' : 'Saved locally'}<ChevronDown size={12} aria-hidden="true" /></summary>
    <p>{isBrowserEdition ? 'Export a Deck file before clearing site data or switching browsers.' : 'Recovery drafts are stored in this browser.'}</p>
  </details>
</div>
