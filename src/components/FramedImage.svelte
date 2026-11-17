<script lang="ts">
  import type {SlideElement} from '../core/model';
  import {imageStyle} from '../core/image-style';
  import ResourceImage from './ResourceImage.svelte';
  let {image,src,thumbnail=false}:{image:SlideElement;src?:string;thumbnail?:boolean}=$props();
</script>
<ResourceImage {src} {thumbnail} alt={image.name} draggable="false" style={imageStyle(image)}/>
