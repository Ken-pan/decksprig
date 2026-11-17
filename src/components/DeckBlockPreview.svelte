<script lang="ts">
  import type { DeckBlock } from '../core/deck-blocks';
  import {fontStack} from '../core/font-stack';
  import {runStyle,paragraphStyle,textBoxStyle,textFlowStyle} from '../core/typography';
  let {block}: {block: DeckBlock} = $props();
</script>

<svg viewBox="0 0 {block.w} {block.h}" role="img" aria-label="{block.name} preview">
  {#each block.elements.filter(e=>!e.hidden) as e}
    <g opacity={e.opacity} transform="translate({e.x+e.w/2} {e.y+e.h/2}) rotate({e.rotation}) scale({e.flipX?-1:1} {e.flipY?-1:1}) translate({-e.x-e.w/2} {-e.y-e.h/2})">
    {#if e.type === 'rect'}
      <rect x={e.x} y={e.y} width={e.w} height={e.h} rx={e.radius} fill={e.fill} stroke={e.stroke} stroke-width={e.strokeWidth} />
    {:else if e.type === 'ellipse'}
      <ellipse cx={e.x+e.w/2} cy={e.y+e.h/2} rx={e.w/2} ry={e.h/2} fill={e.fill} />
    {:else if e.type === 'line'}
      <line x1={e.x} y1={e.flipY?e.y+e.h:e.y} x2={e.x+e.w} y2={e.flipY?e.y:e.y+e.h} stroke={e.stroke} stroke-width={e.strokeWidth} />
    {:else if e.type === 'text'}
      <foreignObject x={e.x} y={e.y} width={e.w} height={e.h}>
        <div class="preview-text" style={textBoxStyle(e)} style:font-family={fontStack(e.fontFamily)} style:font-size="{e.fontSize}px" style:font-weight={e.fontWeight} style:font-style={e.italic?'italic':'normal'} style:text-decoration="none" style:letter-spacing="{e.letterSpacing}px" style:line-height={e.lineHeight} style:color={e.fill} style:text-align={e.align}><div style={textFlowStyle(e)}>{#if e.paragraphs?.length}{#each e.paragraphs as p}<div style={paragraphStyle(p,e)}>{#each p.runs as run}<span style={runStyle(run,e)}>{run.text}</span>{/each}</div>{/each}{:else if e.runs?.length}{#each e.runs as run}<span style={runStyle(run,e)}>{run.text}</span>{/each}{:else}<span style={runStyle({text:e.text},e)}>{e.text}</span>{/if}</div></div>
      </foreignObject>
    {/if}
    </g>
  {/each}
</svg>
<style>
  svg{display:block;width:100%;height:100%;overflow:visible}
  .preview-text{white-space:pre-wrap;overflow-wrap:anywhere;height:100%;overflow:hidden}
</style>
