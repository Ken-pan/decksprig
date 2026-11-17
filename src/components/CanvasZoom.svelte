<script lang="ts">
  import {Minus,Plus,Scan} from '@lucide/svelte';
  import {editor} from '../core/editor.svelte';
  import ActionMenu from './ui/ActionMenu.svelte';
  import {canvasFooterLayout} from '../canvas-footer-layout';
  let {scale,fit,zoom,stage,blocked=false}:{scale:number;fit:boolean;zoom:(value:number|'fit')=>void;stage?:HTMLElement;blocked?:boolean}=$props();
  $effect(()=>{const footer=stage?.closest('.stage-column')?.querySelector<HTMLElement>('.stage-footer');if(footer)return canvasFooterLayout(footer).destroy;});
  function change(delta:number){zoom(Math.round((scale+delta)*100)/100);}
</script>

<ActionMenu label={`Canvas zoom · ${Math.round(scale*100)}%${fit?' · Fit to window':''}`} items={[
  {label:'Fit to window',icon:Scan,shortcut:'⇧1',checked:fit,onselect:()=>zoom('fit')},
  {label:'Zoom to selection',shortcut:'⇧2',disabled:blocked||!editor.selected.length&&!editor.selectedContainer,onselect:()=>stage?.dispatchEvent(new Event('canvas-zoom-selection'))},
  ...[.25,.5,.75,1,1.25,1.5,2].map(value=>({label:`${Math.round(value*100)}%`,checked:!fit&&Math.abs(scale-value)<.001,onselect:()=>zoom(value)})),
  {label:'Zoom out',icon:Minus,divider:true,disabled:scale<=.1,onselect:()=>change(-.1)},
  {label:'Zoom in',icon:Plus,disabled:scale>=4,onselect:()=>change(.1)}
]}><span class="zoom-value">{Math.round(scale*100)}%</span></ActionMenu>
