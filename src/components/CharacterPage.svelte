<script lang="ts">
 import {onMount} from 'svelte';
 import {installUIMotion,setUIMotion} from '../ui-motion';
 import {BRAND,installSavedBrand} from '../branding';
 import BrandLockup from './BrandLockup.svelte';
 onMount(()=>{try{const saved=JSON.parse(localStorage.getItem('deck-studio-settings')||'{}');setUIMotion(saved.uiMotion==='reduced'?'reduced':'system');}catch{setUIMotion('system');}const disposeMotion=installUIMotion(),disposeBrand=installSavedBrand();return()=>{disposeMotion();disposeBrand();};});
 import CharacterLibrary from './CharacterLibrary.svelte';
 import {ArrowLeft} from '@lucide/svelte';
</script>
<main class="character-page"><header><div><a href="/resources/blue-black-v1/index.html" class="text-btn ghost"><ArrowLeft size={15}/>Illustration library</a><h1>Characters and scenes</h1></div><a href="/" class="character-brand" aria-label={`Back to ${BRAND.name}`}><BrandLockup/></a></header><CharacterLibrary standalone/></main>
<style>.character-page{max-width:1240px;margin:0 auto;padding:0 32px 32px}.character-page>header{display:flex;align-items:center;justify-content:space-between;padding:22px 0 20px;margin-bottom:20px;border-bottom:1px solid var(--border-default)}header>div{display:flex;align-items:center;gap:16px}h1{font-size:20px;font-weight:var(--ui-weight-semibold);letter-spacing:0}a{text-decoration:none}@media(max-width:600px){.character-page{padding:0 16px 24px}.character-page>header{align-items:flex-start;padding-top:14px}header>div{display:block}h1{font-size:18px;margin-top:8px}}</style>
