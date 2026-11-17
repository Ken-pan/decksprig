<script lang="ts">
  import Notice from './ui/Notice.svelte';
  let StorageSettings=$state<typeof import('./StorageSettings.svelte').default>();
  $effect(()=>{if(settingsTab==='storage'&&!StorageSettings)void import('./StorageSettings.svelte').then(m=>StorageSettings=m.default);});
  import { Monitor, ChevronDown, PanelLeft, PanelRight, Sparkles, AppWindow, Link2, Info, Check, BookOpen, ExternalLink, ArrowRight } from '@lucide/svelte';
  import BrandLockup from './BrandLockup.svelte';
  import { isBrowserEdition } from '../core/runtime';
  import { BRAND } from '../branding';
  import { Button, SegmentedControl } from './ui';
  import { uiChange, type UIMotionPreference } from '../ui-motion';
  import type { AISettings } from '../../server/ai';
  let {compact = false, onMoreSettings, settingsTab, onTab, theme, palette, uiMotion, leftOpen, rightOpen, setPaneVisibility, onTheme, onPalette, onMotion, aiSettings, onAISettings, serverConfigured, aiModels, aiConnection, modelsBusy = false, modelsFailed = false, applyAppearance, findAIModels, onOpenAI, aiOpenLabel = 'Open AI editor', prototypeClientId, onPrototypeClientId, onPrototype, hasDocument, previewing, onLibrary, onHelp}: {
    compact?: boolean; onMoreSettings?: () => void;
    settingsTab: string; onTab: (value: string) => void; theme: string; palette: string; uiMotion: UIMotionPreference;
    leftOpen: boolean; rightOpen: boolean; setPaneVisibility: (side: 'left' | 'right', visible: boolean) => void;
    onTheme: (value: string) => void; onPalette: (value: string) => void; onMotion: (value: UIMotionPreference) => void;
    aiSettings: AISettings; onAISettings: (patch: Partial<AISettings>) => void; serverConfigured: boolean; aiModels: string[]; aiConnection: string; modelsBusy?: boolean; modelsFailed?: boolean;
    applyAppearance: () => void; findAIModels: () => void; onOpenAI: () => void; aiOpenLabel?:string;
    prototypeClientId: string; onPrototypeClientId: (value: string) => void; onPrototype: () => void;
    hasDocument: boolean; previewing: boolean; onLibrary: () => void; onHelp: () => void;
  } = $props();
  const mcpConfig = isBrowserEdition ? null : {mcpServers:{'deck-studio':{command:'npm',args:['--prefix','/absolute/path/to/decksprig','run','--silent','mcp'],env:{DECK_STUDIO_DATA:'/absolute/path/to/decksprig/.data'}}}};
  const appearances = [{id: 'light', label: 'Light'}, {id: 'dark', label: 'Dark'}, {id: 'system', label: 'System'}];
  const palettes = [
    {id: 'indigo', label: 'Indigo', color: '#4f63e7'},
    {id: 'ocean', label: 'Ocean', color: '#0073d9'},
    {id: 'violet', label: 'Violet', color: '#894ed6'},
    {id: 'rose', label: 'Rose', color: '#bf3584'},
    {id: 'paper', label: 'Paper', color: '#b75400'},
    {id: 'forest', label: 'Forest', color: '#055841'},
    {id: 'graphite', label: 'Graphite', color: '#1f1f1f'},
  ];

</script>

{#if compact}
  <div class="quick-settings ui-control-surface ui-property-surface">
    <section class="quick-settings-group" aria-label="Appearance">
      <h3>Appearance</h3>
      <SegmentedControl label="Appearance" options={appearances.map(({id, label}) => ({value: id, label}))} value={theme} onchange={onTheme} />
    </section>
    <section class="quick-settings-group" aria-label="Accent color">
      <div class="quick-settings-label"><h3>Accent color</h3><span aria-live="polite">{palettes.find(option => option.id === palette)?.label}</span></div>
      <div class="quick-palette" role="group" aria-label="Accent color">
        {#each palettes as option}<button type="button" aria-label={option.label} title={option.label} aria-pressed={palette === option.id} onclick={() => onPalette(option.id)}><span style:background={option.color} aria-hidden="true">{#if palette === option.id}<Check data-ui-marker size={14} />{/if}</span></button>{/each}
      </div>
    </section>
    <section class="quick-settings-group" aria-label="Workspace panels">
      <h3>Workspace panels</h3>
      <div class="quick-pane-options">
        <label class="ui-property-check"><input type="checkbox" checked={leftOpen} onchange={event => setPaneVisibility('left', event.currentTarget.checked)} /><span>Slides</span></label>
        <label class="ui-property-check"><input type="checkbox" checked={rightOpen} onchange={event => setPaneVisibility('right', event.currentTarget.checked)} /><span>Editing panel</span></label>
      </div>
    </section>
    <div class="quick-settings-more ui-popover-more"><Button variant="quiet" onclick={onMoreSettings}>More settings…<ArrowRight size={16} /></Button></div>
  </div>
{:else}
<div class="settings-frame"><div class="settings-layout ui-control-surface ui-property-surface"><nav aria-label="Settings categories">{#each [{id:'appearance',label:'Interface',icon:Monitor},{id:'ai',label:'AI models',icon:Sparkles},{id:'embeds',label:'Prototypes',ariaLabel:'Prototypes and embed settings',icon:AppWindow},...(isBrowserEdition?[]:[{id:'agents',label:'Agents',ariaLabel:'Agents and MCP connection settings',icon:Link2}]),{id:'storage',label:'Storage',icon:BookOpen},{id:'about',label:'About',icon:Info}] as tab}<button class:active={settingsTab===tab.id} aria-pressed={settingsTab===tab.id} aria-label={tab.ariaLabel ?? tab.label} title={tab.ariaLabel} onclick={()=>onTab(tab.id)}><tab.icon size={16} />{tab.label}</button>{/each}</nav><div class="settings-body" use:uiChange={settingsTab}>
        {#if settingsTab==='appearance'}
          <h3>Interface and workspace</h3>
          <section class="appearance-section"><h4 id="workspace-panes-label">Workspace panels</h4><div class="workspace-pane-options" role="group" aria-labelledby="workspace-panes-label"><label class="ui-property-check"><span><PanelLeft size={16}/>Slides</span><input type="checkbox" checked={leftOpen} onchange={event=>setPaneVisibility('left',event.currentTarget.checked)}/></label><label class="ui-property-check"><span><PanelRight size={16}/>Editing panel</span><input type="checkbox" checked={rightOpen} onchange={event=>setPaneVisibility('right',event.currentTarget.checked)}/></label></div></section>
          <section class="appearance-section"><h4 id="appearance-label">Appearance</h4><SegmentedControl label="Appearance" options={appearances.map(({id,label})=>({value:id,label}))} value={theme} onchange={onTheme} /></section>
          <section class="appearance-section"><h4 id="palette-label">Accent color</h4><div class="palette-options" role="group" aria-labelledby="palette-label">{#each palettes as option}<button aria-pressed={palette===option.id} onclick={()=>onPalette(option.id)}><span class="palette-swatch" style:background={option.color} aria-hidden="true"></span><span>{option.label}</span>{#if palette===option.id}<Check data-ui-marker size={14}/>{/if}</button>{/each}</div></section>
          <section class="appearance-section"><h4 id="ui-motion-label">Interface motion</h4><SegmentedControl label="Interface motion" options={[{value:'system',label:'System'},{value:'reduced',label:'Reduce motion'}]} value={uiMotion} onchange={value=>onMotion(value as UIMotionPreference)}/><p class="hint settings-control-hint">Does not affect slide animations.</p></section>
          <p class="hint settings-footnote">Saved in this browser.</p>
        {:else if settingsTab==='ai'}
          <h3>AI models</h3>
          <section class="settings-section" aria-labelledby="ai-connection-label"><h4 id="ai-connection-label">Connect provider</h4>
            <label class="field-label">Provider type<select class="ui-property-input" aria-label="AI provider type" disabled={modelsBusy} value={aiSettings.provider} onchange={event=>onAISettings({provider:event.currentTarget.value as AISettings['provider']})}><option value="compatible">{isBrowserEdition?'OpenAI-compatible':'Local / OpenAI-compatible'}</option><option value="openai">OpenAI Responses API</option></select></label>
            {#if aiSettings.provider==='compatible'}<label class="field-label">API base URL<input class="ui-property-input" aria-label="AI API base URL" disabled={modelsBusy} value={aiSettings.baseUrl} onchange={event=>onAISettings({baseUrl:event.currentTarget.value})} placeholder={isBrowserEdition?'https://api.example.com/v1':'http://127.0.0.1:11434/v1'} spellcheck="false"/></label>{/if}
            <label class="field-label">API key<input class="ui-property-input" aria-label="API key" disabled={modelsBusy} type="password" value={aiSettings.apiKey} oninput={event=>onAISettings({apiKey:event.currentTarget.value})} autocomplete="off" placeholder="Enter a key if required"/></label>
            <p class="hint">Used for this session only.</p>
            <p class="hint settings-connection-state">{serverConfigured?'A key is already available.':aiSettings.provider==='compatible'?'Local models may not need a key.':'Enter your provider’s API key.'}</p>
          </section>
          <section class="settings-section" aria-labelledby="ai-model-label"><h4 id="ai-model-label">Choose model</h4><label class="field-label">Model name<input class="ui-property-input" aria-label="Model name" disabled={modelsBusy} list="available-ai-models" value={aiSettings.model} oninput={event=>onAISettings({model:event.currentTarget.value})} placeholder="Provider’s model name" spellcheck="false"/></label><datalist id="available-ai-models">{#each aiModels as model}<option value={model}></option>{/each}</datalist><Button variant="quiet" busy={modelsBusy} onclick={findAIModels}>Find models</Button>{#if aiConnection}<Notice tone={modelsFailed?'error':'info'} title={modelsFailed?'Models could not be found':undefined} message={aiConnection}/>{/if}</section>
          <div class="settings-actions"><Button variant="primary" onclick={onOpenAI}>{aiOpenLabel}</Button></div>
        {:else if settingsTab==='embeds'}
          <h3>Prototype embeds</h3><p class="hint">Add a share link. Choose Interact while presenting.</p><div class="settings-actions"><Button variant="secondary" disabled={!hasDocument || previewing} onclick={onPrototype}>Add prototype to slide</Button></div>
          <details class="settings-disclosure ui-control-disclosure" open={Boolean(prototypeClientId)}><summary><span>Figma controls</span><small>Optional</small><ChevronDown size={14}/></summary><div class="settings-disclosure-body"><p class="hint">To enable restart controls, enter your Figma app’s public client ID.</p><label class="field-label">Figma client ID<input class="ui-property-input" aria-label="Figma client ID" value={prototypeClientId} onchange={event=>onPrototypeClientId(event.currentTarget.value)} placeholder="Public Figma OAuth client ID" spellcheck="false"/></label><p class="hint">Allow this site as an embed domain in your Figma app.</p><div class="settings-site"><span>Current site</span><code>{window.location.origin}</code></div><p class="hint">Use Reload if Figma does not report that it is ready. Exported pages need their own allowed domain.</p><a class="settings-help-link" href="https://developers.figma.com/docs/embeds/embed-api/" target="_blank" rel="noopener noreferrer">Figma Embed API setup <ExternalLink size={16} /></a></div></details>
        {:else if settingsTab==='agents'}
          <h3>Agent connection</h3><p class="hint">Review agent changes in the AI panel.</p><details class="settings-disclosure ui-control-disclosure"><summary><span>MCP connection settings</span><ChevronDown size={14}/></summary><div class="settings-disclosure-body"><p class="hint">Replace the project path, then add this configuration to your agent client.</p><pre class="code-block">{JSON.stringify(mcpConfig,null,2)}</pre><p class="hint">Reconnect your agent after changing this configuration.</p></div></details>
        {:else if settingsTab==='storage'}
          {#if StorageSettings}<StorageSettings />{/if}
        {:else if settingsTab==='about'}
          <div class="brand-about"><BrandLockup size="large" caption={BRAND.description}/><p class="brand-about-intro">{isBrowserEdition?'A browser editor':'A local editor'} for portfolios, reviews, and presentations.</p><dl class="brand-facts"><div><dt>Version</dt><dd>{BRAND.version}</dd></div><div><dt>Workspace</dt><dd>{isBrowserEdition?'Documents and history in this browser':'Local documents and version history'}</dd></div></dl><div class="brand-about-actions"><Button variant="primary" onclick={onLibrary}><BookOpen size={16}/>Open document library</Button><Button variant="secondary" onclick={onHelp}>Keyboard shortcuts</Button></div><p class="brand-about-footnote">{isBrowserEdition?'Export a Deck file (.deck.json) before switching browsers or clearing site data. Documents do not sync automatically.':'Documents are saved on this device.'}</p><div class="brand-about-actions brand-legal-links"><a href="/privacy.html" target="_blank" rel="noopener noreferrer">Data and privacy<ExternalLink size={16}/></a><a href="/licenses.html" target="_blank" rel="noopener noreferrer">Licenses and credits<ExternalLink size={16}/></a></div></div>
        {/if}
      </div></div></div>
{/if}

<style>
.brand-legal-links{margin-top:12px;gap:4px 16px;flex-wrap:wrap}.brand-legal-links a{display:inline-flex;align-items:center;gap:6px;min-height:44px;color:var(--text-secondary);font-size:var(--ui-label);white-space:nowrap;text-underline-offset:3px}

.quick-settings { display: flex; flex: none; flex-direction: column; gap: 12px; }
.quick-settings-group { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.quick-settings h3 { font-size: var(--ui-label); font-weight: var(--ui-weight-medium); line-height: var(--ui-line-body); margin: 0; color: var(--text-secondary); }
.quick-settings-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: var(--ui-label); }
.quick-settings-label > span { color: var(--text-primary); }
.quick-pane-options { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; }
.quick-pane-options label { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 8px; font-size: var(--ui-text); cursor: pointer; border-radius: var(--r-control); }
.quick-pane-options label:hover { background: var(--state-hover); }
.settings-frame{container:settings-content / inline-size;min-width:0}
.settings-layout{align-items:start}
.settings-body .field-label { margin: 0; }
@container settings-content (max-width:30rem){
  .settings-layout{grid-template-columns:minmax(0,1fr);gap:24px}
  .settings-layout nav{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,7.5rem),1fr));gap:4px}
  .settings-layout nav button{min-width:0;min-height:44px;padding:8px;justify-content:center;white-space:normal;overflow-wrap:anywhere}
  .settings-body .palette-options{grid-template-columns:repeat(2,minmax(0,1fr))}
  .settings-body .palette-options button{min-width:0;min-height:44px;padding:8px;gap:8px}
  .settings-body .palette-options button :global(svg){margin-left:auto;flex:none}
}
@media (max-width: 760px), (pointer: coarse) { .quick-pane-options label { min-height: 44px; } }
</style>
