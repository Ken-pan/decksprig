<script lang="ts">
  import type { Slide } from '../core/model';
  import { contentBounds, columnBounds, type PageSize } from '../core/page-layout-geometry';
  import {selectionBounds,type Bounds} from '../core/interactions';
  import type { SnapGuide, SnapMeasure } from '../core/snapping';
  let {page,slide,scale,showLayout,guides,moving,readout=''}:{page:PageSize;slide:Slide;scale:number;showLayout:boolean;guides:SnapGuide[];moving:Bounds|null;readout?:string}=$props();
  const content=$derived(contentBounds(page,slide)),columns=$derived(columnBounds(page,slide));
  const label=$derived.by(()=>{
    const w=guides.find(g=>g.kind==='size'&&g.axis==='x'),h=guides.find(g=>g.kind==='size'&&g.axis==='y');
    if(w&&h)return[`Match size ${Math.round(w.value*10)/10} × ${Math.round(h.value*10)/10} px`,...guides.filter(g=>g.kind!=='size').map(g=>g.label)].join(' · ');
    return [...new Set(guides.map(g=>g.label))].join(' · ');
  });
  let feedbackSize=$state({w:0,h:0});
  const badgeWidth=$derived.by(()=>{
    const side=moving?Math.max(moving.x,page.width-moving.x-moving.w)*scale-20:0;
    return Math.min(260,page.width*scale-16,...(readout&&side>=112?[side]:[]))/scale;
  });
  function measureFeedback(node:HTMLElement){
    const update=()=>{feedbackSize={w:node.offsetWidth,h:node.offsetHeight};};
    const observer=new ResizeObserver(update);observer.observe(node);update();return{destroy:()=>observer.disconnect()};
  }
  const badge=$derived.by(()=>{
    if(!moving)return{x:0,y:0};
    const w=Math.min(feedbackSize.w||badgeWidth,badgeWidth),h=feedbackSize.h||(readout?44:28)/scale,pad=8/scale,gap=12/scale;
    const spacing=guides.filter(g=>(g.kind==='spacing'||g.kind==='gap')&&g.axis==='x').flatMap(g=>(g.segments??[]).filter(s=>!s.reference).map(s=>s.at??g.value));
    const dimensions=guides.flatMap(g=>(g.measures??[]).filter(m=>!m.reference).map(m=>m.label.y));
    const below=Math.max(moving.y+moving.h+14/scale,...spacing.map(y=>y+24/scale),...dimensions.map(y=>y+16/scale));
    const above=Math.min(moving.y-h-gap,...spacing.map(y=>y-h-gap),...dimensions.map(y=>y-h-16/scale));
    const x=Math.max(pad,Math.min(moving.x,page.width-w-pad)),y=Math.max(pad,Math.min(moving.y+moving.h/2-h/2,page.height-h-pad));
    const obstacles:Bounds[]=[moving,...slide.elements.filter(e=>!e.hidden&&guides.some(g=>g.ids.includes(e.id))).flatMap(e=>{const b=selectionBounds([e]);return b?[b]:[];}),...guides.flatMap(g=>(g.measures??[]).map(m=>{const width=(String(Math.round(g.value*10)/10).length*6.5+8)/scale;return{x:m.label.x-width/2,y:m.label.y-9/scale,w:width,h:18/scale};}))];
    const candidates=[{x,y:below},{x,y:above},{x:moving.x-w-gap,y},{x:moving.x+moving.w+gap,y}].filter(p=>p.x>=pad&&p.y>=pad&&p.x+w<=page.width-pad&&p.y+h<=page.height-pad);
    const overlap=(p:{x:number;y:number})=>obstacles.reduce((area,b)=>area+Math.max(0,Math.min(p.x+w,b.x+b.w)-Math.max(p.x,b.x))*Math.max(0,Math.min(p.y+h,b.y+b.h)-Math.max(p.y,b.y)),0);
    return candidates.sort((a,b)=>overlap(a)-overlap(b))[0]??{x,y:Math.max(pad,Math.min(below,page.height-h-pad))};
  });
  function measurementPath(m:SnapMeasure){
    const length=Math.hypot(m.to.x-m.from.x,m.to.y-m.from.y)||1,nx=(m.to.y-m.from.y)/length*3/scale,ny=(m.from.x-m.to.x)/length*3/scale;
    return`M ${m.from.x} ${m.from.y} L ${m.to.x} ${m.to.y} M ${m.from.x-nx} ${m.from.y-ny} L ${m.from.x+nx} ${m.from.y+ny} M ${m.to.x-nx} ${m.to.y-ny} L ${m.to.x+nx} ${m.to.y+ny}`;
  }
</script>
{#if showLayout}
  <div class="layout-reference-layer" aria-hidden="true" style:--u="{1/scale}px">
    <div class="page-margin-box" data-margin-box style:left="{content.x}px" style:top="{content.y}px" style:width="{content.w}px" style:height="{content.h}px"></div>
    {#if columns.length>1}{#each columns as col,i}<div class="column-reference" class:first-column={i===0} class:last-column={i===columns.length-1} data-column={i+1} style:left="{col.x}px" style:top="{col.y}px" style:width="{col.w}px" style:height="{col.h}px"></div>{/each}{/if}
  </div>
{/if}
{#if guides.length}
  <div class="magnet-layer" aria-hidden="true" style:--u="{1/scale}px">
    {#each guides as guide}
      {#if guide.kind==='size'}
        {#each guide.measures??[] as measure}
          <div class="dimension-measure" data-snap-kind="size" data-snap-axis={guide.axis} data-size-reference={measure.reference||undefined}>
            <svg width={page.width} height={page.height}><path d={measurementPath(measure)} fill="none" stroke="currentColor" stroke-width={1/scale} stroke-dasharray={measure.reference?`${3/scale} ${3/scale}`:undefined}/></svg>
            <span style:left="{measure.label.x}px" style:top="{measure.label.y}px">{Math.round(guide.value*10)/10}</span>
          </div>
        {/each}
      {:else if guide.kind==='spacing'||guide.kind==='gap'}
        {#each guide.segments??[] as segment}
          <div class="spacing-guide" class:reference-spacing={segment.reference} class:vertical-spacing={guide.axis==='y'} data-snap-kind={guide.kind} data-snap-axis={guide.axis} data-spacing-reference={segment.reference||undefined} style:left="{guide.axis==='x'?segment.from:segment.at??guide.value}px" style:top="{guide.axis==='x'?segment.at??guide.value:segment.from}px" style:width="{guide.axis==='x'?segment.to-segment.from:1/scale}px" style:height="{guide.axis==='y'?segment.to-segment.from:1/scale}px">
            <span>{Math.round((segment.to-segment.from)*10)/10}</span>
          </div>
        {/each}
      {:else}
        <div class="canvas-guide" class:vertical={guide.axis==='x'} class:horizontal={guide.axis==='y'} data-snap-kind={guide.kind} data-snap-axis={guide.axis} style:opacity={guide.kind==='grid'?.65:1} style:left="{guide.axis==='x'?guide.value:guide.from}px" style:top="{guide.axis==='y'?guide.value:guide.from}px" style:width="{guide.axis==='x'?1/scale:guide.to-guide.from}px" style:height="{guide.axis==='y'?1/scale:guide.to-guide.from}px"></div>
      {/if}
    {/each}
    {#if moving}<div class="snap-feedback" use:measureFeedback style:left="{badge.x}px" style:top="{badge.y}px" style:max-width="{badgeWidth}px"><span>{label}</span>{#if readout}<span class="resize-readout">{readout}</span>{/if}</div>{/if}
  </div>
{/if}
<style>
  .layout-reference-layer,.magnet-layer{position:absolute;inset:0;pointer-events:none}
  .layout-reference-layer{z-index:20}
  .page-margin-box{position:absolute;border:var(--u) dashed var(--canvas-margin);opacity:.55}
  .column-reference{position:absolute;border-inline:var(--u) solid var(--canvas-column);opacity:.4}
  .first-column{border-left:0}.last-column{border-right:0}
  .magnet-layer{z-index:35;color:var(--canvas-snap)}
  .canvas-guide,.spacing-guide{position:absolute;background:currentColor}
  .dimension-measure,.dimension-measure svg{position:absolute;inset:0;overflow:visible}.dimension-measure svg{width:100%;height:100%}
  .dimension-measure span{position:absolute;translate:-50% -50%;font:calc(11*var(--u))/1.3 var(--font-ui);font-variant-numeric:tabular-nums;white-space:nowrap;background:var(--surface-overlay);padding:0 calc(3*var(--u));border-radius:calc(2*var(--u))}
  .reference-spacing{background:repeating-linear-gradient(90deg,currentColor 0 calc(3*var(--u)),transparent calc(3*var(--u)) calc(6*var(--u)))}
  .reference-spacing.vertical-spacing{background:repeating-linear-gradient(0deg,currentColor 0 calc(3*var(--u)),transparent calc(3*var(--u)) calc(6*var(--u)))}
  .spacing-guide::before,.spacing-guide::after{content:'';position:absolute;width:var(--u);height:calc(7*var(--u));background:currentColor;top:calc(-3*var(--u))}
  .spacing-guide::before{left:0}.spacing-guide::after{right:0}
  .vertical-spacing::before,.vertical-spacing::after{height:var(--u);width:calc(7*var(--u));left:calc(-3*var(--u));right:auto}
  .vertical-spacing::before{top:0}.vertical-spacing::after{top:auto;bottom:0}
  .spacing-guide span{position:absolute;left:50%;top:calc(3*var(--u));translate:-50% 0;font:calc(11*var(--u))/1.3 var(--font-ui);font-variant-numeric:tabular-nums;white-space:nowrap;background:var(--surface-overlay);padding:0 calc(3*var(--u));border-radius:calc(2*var(--u))}
  .vertical-spacing span{left:calc(4*var(--u));top:50%;translate:0 -50%}
  .snap-feedback{position:absolute;padding:calc(4*var(--u)) calc(7*var(--u));border-radius:calc(4*var(--u));background:var(--surface-overlay);border:var(--u) solid color-mix(in srgb,var(--canvas-snap) 45%,transparent);color:var(--text-primary);font:calc(11*var(--u))/1.4 var(--font-ui);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;box-shadow:0 calc(2*var(--u)) calc(8*var(--u)) var(--border-subtle)}
  .snap-feedback>span{display:block;white-space:normal;overflow-wrap:normal}
  .resize-readout{margin-top:calc(2*var(--u));color:var(--text-secondary)}
</style>
