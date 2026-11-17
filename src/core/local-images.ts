import { resourceElement, MAX_RESOURCE_BATCH } from './resources';
import type { Deck, SlideElement } from './model';
import {imageDimensions} from './image-dimensions';

// File decoding is loaded only when the user chooses local images.
export async function localImageElements(files: File[], deck: Deck): Promise<SlideElement[]> {
  if (files.length > MAX_RESOURCE_BATCH) throw new Error(`You can import up to ${MAX_RESOURCE_BATCH} images at a time.`);
  if (files.some(file => file.size > 25_000_000 || !/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type))) throw new Error('Choose a PNG, JPEG, WebP, GIF, or SVG smaller than 25 MB.');
  if (files.reduce((sum, file) => sum + file.size, 0) > 50_000_000) throw new Error('These images exceed 50 MB. Import them in smaller batches.');
  const images:SlideElement[]=[];
  for (const file of files) {
    const size=await imageDimensions(file,file.name);
    const src = await new Promise<string>((ok, no) => { const reader=new FileReader();reader.onload=()=>ok(String(reader.result));reader.onerror=()=>no(reader.error);reader.readAsDataURL(file); });
    const image=resourceElement(src,undefined,size.w||1,size.h||1,deck);image.name=file.name.slice(0,200);images.push(image);
  }
  return images;
}
