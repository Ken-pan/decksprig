import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rm, copyFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Run against the current source with DECK_STUDIO_LIVE_WELCOME=1 in production,
// or the development server. Generating snapshots requires Chromium and cwebp.
const origin = process.argv[2] ?? 'http://127.0.0.1:4310/';
const playwright = process.env.DECK_STUDIO_PLAYWRIGHT_MODULE;
const {chromium} = await import(playwright ? pathToFileURL(playwright).href : 'playwright');
const destination = new URL('../src/assets/welcome/', import.meta.url);
const source = new URL('../src/core/template-covers.json', import.meta.url);
const before = await readFile(source);
const names = ['portfolio', 'review', 'minimal'];
const temporary = await mkdtemp(join(tmpdir(), 'deck-welcome-covers-'));
try {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 2, reducedMotion: 'reduce'});
    await page.goto(origin);
    const frames = page.locator('.welcome-cover .canvas-wrap');
    await frames.last().waitFor();
    if (await frames.count() !== names.length) throw new Error('Unexpected number of template cover canvases.');
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.querySelectorAll('.welcome-cover img'), image => image.decode()));
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
    for (const [index, name] of names.entries()) {
      const png = join(temporary, name + '.png');
      await frames.nth(index).screenshot({path: png});
      execFileSync('cwebp', ['-quiet', '-lossless', png, '-o', join(temporary, name + '.webp')]);
    }
  } finally {
    await browser.close();
  }
  if (!before.equals(await readFile(source))) throw new Error('Template cover data changed during capture. Repeat against the new build.');
  for (const name of names) await copyFile(join(temporary, name + '.webp'), new URL(name + '.webp', destination));
  await writeFile(new URL('source.sha256', destination), createHash('sha256').update(before).digest('hex') + '\n');
} finally {
  await rm(temporary, {recursive: true, force: true});
}
