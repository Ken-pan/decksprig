import {PNG} from 'pngjs';

export function illustrationThumbnail(png) {
  const scale = Math.min(1, 480 / Math.max(png.width, png.height));
  const image = new PNG({width: Math.round(png.width * scale), height: Math.round(png.height * scale)});
  // Recoloring is per pixel, so nearest-neighbor sampling can run first.
  for (let y = 0; y < image.height; y++) {
    const row = Math.min(png.height - 1, Math.floor(y / scale)) * png.width;
    for (let x = 0; x < image.width; x++) {
      const source = (row + Math.min(png.width - 1, Math.floor(x / scale))) * 4;
      png.data.copy(image.data, (y * image.width + x) * 4, source, source + 4);
    }
  }
  return image;
}
