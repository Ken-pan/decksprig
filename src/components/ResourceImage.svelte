<script lang="ts">
  import type {HTMLImgAttributes} from 'svelte/elements';
  import {isBrowserEdition} from '../core/runtime';
  let {src='',thumbnail=false,...attributes}:HTMLImgAttributes&{thumbnail?:boolean}=$props();
  let resolved=$state('');
  $effect(()=>{
    const url=String(src||'');
    if(thumbnail&&(!isBrowserEdition||!url.startsWith('/api/'))){
      resolved='';let stopped=false,release:undefined|(()=>void);
      void import('../core/thumbnail-image').then(({acquireThumbnail})=>{if(stopped)return;const lease=acquireThumbnail(url);release=lease.release;return lease.ready.then(value=>{if(!stopped)resolved=value??url;});}).catch(()=>{if(!stopped)resolved=url;});
      return ()=>{stopped=true;release?.();};
    }
    if(!isBrowserEdition||!url.startsWith('/api/')){resolved=url;return;}
    resolved='';let stopped=false,objectUrl='';const controller=new AbortController();
    void fetch(url,{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error('Preview unavailable');const blob=await response.blob();if(stopped)return;objectUrl=URL.createObjectURL(blob);resolved=objectUrl;}).catch(()=>{if(!stopped)resolved='data:image/png;base64,';});
    return ()=>{stopped=true;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  });
</script>
<img {...attributes} src={resolved||undefined} />
