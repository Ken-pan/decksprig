import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import JSZip from 'jszip';
import {graphicInfo} from '../public/resources/graphic-engine.js';

// Original, deterministic vector artwork. No image generation or copied generator code.
const root = resolve('public/resources/deck-graphics-v1');
await mkdir(resolve(root, 'originals'), {recursive: true});
const ink = '#26362c', items = [], W = 1600, H = 900;
const hash = value => createHash('sha256').update(value).digest('hex');
const f = n => Number(n.toFixed(2));
const circle = (x, y, r, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" ${extra}/>`;
const line = (x1, y1, x2, y2, extra = '') => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" ${extra}/>`;
const path = (d, extra = '') => `<path d="${d}" ${extra}/>`;
const stroke = body => `<g fill="none" stroke="${ink}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
function random(seed = 41) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
function tile(body, width, height, opacity = .2) {
  return `<defs><pattern id="tile" width="${width}" height="${height}" patternUnits="userSpaceOnUse">${body}</pattern></defs><rect width="${W}" height="${H}" fill="url(#tile)" opacity="${opacity}"/>`;
}
async function add(id, title, category, body, tags, dimensions = [W, H], extra = {}) {
  const [width, height] = dimensions;
  const original = !extra.creator;
  const item = {id, title, category, tags: tags.split(' '), width, height,
    background: category !== 'accent', file: `${id}.svg`, colorable: true,
    provider: original ? 'Deckleaf Graphics' : 'Hero Patterns', creator: original ? 'Deckleaf' : extra.creator,
    sourceUrl: original ? 'http://127.0.0.1:4310/resources/deck-graphics-v1/README.md' : extra.sourceUrl,
    license: original ? 'CC0 1.0' : 'CC BY 4.0',
    licenseUrl: original ? 'https://creativecommons.org/publicdomain/zero/1.0/' : 'https://creativecommons.org/licenses/by/4.0/',
    attributionRequired: !original, ...extra};
  const notice = `${title} — ${item.creator}. ${item.license}. Source: ${item.sourceUrl}.${original ? '' : ' Adapted by Deckleaf: repeated on a transparent 1600 × 900 canvas, recolorable ink, reduced opacity.'}`;
  const svg = `<!-- ${notice} -->\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="${ink}"><title>${title}</title>${body}</svg>\n`;
  item.licenseNotice = notice; item.sha256 = hash(svg);
  await writeFile(resolve(root, item.file), svg); items.push(item);
}

// Six halftones: regular, staggered, and density-controlled focal areas.
await add('fine-dots', 'Fine dots', 'pattern', tile(circle(12, 12, 1.7), 24, 24, .3), 'dots halftone fine subtle background 网点 点阵 背景');
await add('offset-dots', 'Offset dots', 'pattern', tile(circle(8, 8, 2.4) + circle(24, 24, 2.4), 32, 32, .24), 'dots offset halftone background 网点 背景');
await add('bold-dots', 'Bold dots', 'pattern', tile(circle(20, 20, 5), 40, 40, .22), 'dots pop art comic bold background 网点 波点 漫画');
for (const [id, title, mode] of [['halftone-fade', 'Halftone fade', 'fade'], ['halftone-corner', 'Halftone corner', 'corner'], ['halftone-wave', 'Halftone wave', 'wave']]) {
  let body = '';
  for (let y = 12; y < H; y += 24) for (let x = 12; x < W; x += 24) {
    const density = mode === 'fade' ? (x / W) ** 2 : mode === 'corner' ? Math.max(0, 1 - Math.hypot((W-x)/W, y/H) * 1.35) : Math.max(0, 1 - Math.abs(y/H - (.64 + .17*Math.sin(x/260))) * 3.3);
    const r = 6.5 * density; if (r > .45) body += circle(x, y, r);
  }
  await add(id, title, 'pattern', `<g opacity=".3">${body}</g>`, `dots halftone ${mode} ${mode==='fade'?'gradient 渐变':mode==='corner'?'角落':'波浪'} background 网点 背景`);
}
// Grids and lines.
await add('square-grid', 'Square grid', 'pattern', tile(path('M40 0H0V40', `fill="none" stroke="${ink}" stroke-width="1.2"`), 40, 40), 'grid square graph background 网格 背景');
await add('dot-cross-grid', 'Cross grid', 'pattern', tile(stroke(path('M20 14V26M14 20H26', 'stroke-width="1.2"')), 40, 40), 'grid cross plus technical background 网格 十字');
await add('engineering-grid', 'Engineering grid', 'pattern', tile(path('M20 0V100M40 0V100M60 0V100M80 0V100M0 20H100M0 40H100M0 60H100M0 80H100', `stroke="${ink}" stroke-width=".7" opacity=".4"`) + path('M100 0H0V100', `stroke="${ink}" stroke-width="1.5" fill="none"`), 100, 100, .24), 'grid engineering graph technical blueprint background 网格 工程');
await add('diagonal-hatch', 'Diagonal hatch', 'pattern', tile(path('M-4 4L4-4M0 28L28 0M24 32L32 24', `stroke="${ink}" stroke-width="1.3" fill="none"`), 28, 28), 'diagonal hatch stripe line background 斜线 条纹');
await add('crosshatch', 'Crosshatch', 'pattern', tile(path('M0 0L32 32M0 32L32 0', `stroke="${ink}" stroke-width="1" fill="none"`), 32, 32, .14), 'crosshatch line woven background 交叉 纹理');
await add('horizontal-rules', 'Horizontal rules', 'pattern', tile(line(0, 28, 1600, 28, `stroke="${ink}" stroke-width="1.2"`), 1600, 32, .18), 'lines ruled notebook background 横线 笔记');
// Larger geometry and flowing backgrounds.
await add('contour-flow', 'Contour flow', 'pattern', `<g fill="none" stroke="${ink}" stroke-width="1.7" opacity=".22">${Array.from({length: 33}, (_, i) => path(`M-80 ${i*34-140}C400 ${i*23+20} 690 ${i*37-200} 1000 ${i*26+180}S1430 ${i*32+40} 1700 ${i*29+170}`)).join('')}</g>`, 'contour flow topographic lines wave background 等高线 波纹');
await add('ripple-corner', 'Corner ripples', 'pattern', `<g fill="none" stroke="${ink}" stroke-width="2" opacity=".22">${Array.from({length: 28}, (_, i) => circle(1520, 60, 45+i*32)).join('')}</g>`, 'ripple rings circle corner background 波纹 圆环');
await add('sine-waves', 'Sine waves', 'pattern', tile(path('M-80 40Q-40 8 0 40T80 40T160 40T240 40', `fill="none" stroke="${ink}" stroke-width="1.6"`), 160, 80, .22), 'sine wave line background 波浪 波纹');
await add('isometric-grid', 'Isometric grid', 'pattern', tile(path('M0 0V92M0 46L80 0M0 46L80 92M0 0L80 46M0 92L80 46', `fill="none" stroke="${ink}" stroke-width="1"`), 80, 92, .2), 'isometric grid triangle technical background 等距 网格');
await add('checkerboard', 'Soft checkerboard', 'pattern', tile('<path d="M0 0H48V48H0ZM48 48H96V96H48Z"/>', 96, 96, .09), 'checker squares checkerboard background 棋盘 方格');
await add('memphis-marks', 'Memphis marks', 'pattern', tile(stroke(path('M20 22L34 12L48 22L62 12', 'stroke-width="2"') + circle(102, 78, 8, 'stroke-width="2"') + path('M170 22L183 48H157Z', 'stroke-width="2"') + path('M62 125L82 145M82 125L62 145', 'stroke-width="2"')), 220, 170, .22), 'memphis playful geometric confetti background 孟菲斯 几何');
// Six textures, built with explicit vector marks (no raster filters).
for (const [id, title, mode, count] of [['paper-grain','Paper grain','grain',6500],['sparse-speckles','Sparse speckles','speckle',1600],['riso-grain','Riso grain','riso',3200],['fiber-paper','Paper fibers','fiber',1200],['etched-lines','Etched lines','etched',1700],['dust-flecks','Dust flecks','dust',1300]]) {
  const rand = random(id.length * 917); let body = '';
  for (let i = 0; i < count; i++) {
    const x = rand()*W, y = rand()*H, r = .4 + rand()* (mode === 'riso' ? 3 : mode === 'speckle' ? 1.8 : 1);
    body += mode === 'fiber' || mode === 'etched' ? line(x,y,x+4+rand()*18,y+(rand()-.5)*5, `stroke="${ink}" stroke-width="${f(.4+rand()*.7)}" opacity="${f(.15+rand()*.3)}"`) : circle(x,y,r, `opacity="${f(.1+rand()*.35)}"`);
  }
  await add(id, title, 'texture', body, `texture grain paper speckle ${mode} background 纹理 颗粒 纸张`);
}
// Twenty-four isolated accents for annotation and editorial composition.
const polar = (r, angle) => [f(256+r*Math.cos(angle)), f(256+r*Math.sin(angle))].join(',');
await add('starburst', 'Starburst', 'accent', `<polygon points="${Array.from({length:32},(_,i)=>polar(i%2?116:220,i*Math.PI/16)).join(' ')}"/>`, 'starburst star burst badge 星芒 爆炸 贴纸', [512,512]);
await add('asterisk', 'Asterisk', 'accent', stroke(Array.from({length:6},(_,i)=>{const a=i*Math.PI/3;return line(256+176*Math.cos(a),256+176*Math.sin(a),256-176*Math.cos(a),256-176*Math.sin(a),'stroke-width="18"');}).join('')), 'asterisk star rays spark 星芒 星号', [512,512]);
await add('sparkle', 'Sparkle', 'accent', path('M256 34C273 197 315 239 478 256C315 273 273 315 256 478C239 315 197 273 34 256C197 239 239 197 256 34Z'), 'sparkle star four point shine 闪光 星芒', [512,512]);
await add('sparkle-cluster', 'Sparkle cluster', 'accent', path('M230 64Q249 212 395 230Q249 249 230 395Q212 249 64 230Q212 212 230 64Z')+path('M411 306Q421 367 480 378Q421 389 411 450Q400 389 340 378Q400 367 411 306Z')+circle(414,90,14), 'sparkle cluster stars shine 星星 闪光', [512,512]);
await add('sun-rays', 'Sun rays', 'accent', stroke(circle(256,256,91,'stroke-width="5"')+Array.from({length:16},(_,i)=>{const a=i*Math.PI/8;return line(256+140*Math.cos(a),256+140*Math.sin(a),256+210*Math.cos(a),256+210*Math.sin(a),'stroke-width="5"');}).join('')), 'sun rays circle radial 太阳 光芒', [512,512]);
await add('orbit-rings', 'Orbit rings', 'accent', `<g fill="none" stroke="${ink}" stroke-width="4">${circle(256,256,170)}<ellipse cx="256" cy="256" rx="222" ry="78" transform="rotate(-28 256 256)"/></g>${circle(430,162,14)}`, 'orbit rings circle space 圆环 轨道', [512,512]);
await add('curved-arrow', 'Curved arrow', 'accent', stroke(path('M68 406C40 144 237 87 424 152M350 83L432 154L350 199','stroke-width="10"')), 'arrow curved annotation hand drawn 箭头 弯曲', [512,512]);
await add('loop-arrow', 'Loop arrow', 'accent', stroke(path('M70 367C74 271 190 213 248 268C343 359 159 392 169 226C176 116 305 88 430 128M369 65L436 129L363 167','stroke-width="9"')), 'arrow loop annotation swirl 箭头 环绕', [512,512]);
await add('straight-arrow', 'Sketch arrow', 'accent', stroke(path('M42 292Q221 243 449 249M381 191L451 249L392 310','stroke-width="10"')), 'arrow straight right annotation 箭头 手绘', [512,512]);
await add('double-arrow', 'Double arrow', 'accent', stroke(path('M58 270Q250 230 457 248M121 204L55 270L126 317M387 188L457 248L392 312','stroke-width="8"')), 'arrow double compare annotation 双向 箭头', [512,512]);
await add('wavy-arrow', 'Wavy arrow', 'accent', stroke(path('M40 289C93 167 138 371 195 254S310 178 353 247S427 250 455 183M389 176L457 181L445 250','stroke-width="8"')), 'arrow wave annotation playful 波浪 箭头', [512,512]);
await add('corner-arrow', 'Corner arrow', 'accent', stroke(path('M70 415V255Q70 137 187 137H430M362 74L435 137L364 195','stroke-width="8"')), 'arrow corner bend annotation 转角 箭头', [512,512]);
await add('sketch-circle', 'Sketch circle', 'accent', stroke(path('M360 93C221 40 52 124 67 284C82 430 325 471 431 315C517 188 363 53 200 78M130 97C37 221 92 399 275 420','stroke-width="7"')), 'circle ring hand drawn annotation highlight 圈画 圆圈 标注', [512,512]);
await add('sketch-oval', 'Sketch oval', 'accent', stroke(path('M340 49C151 21 21 72 36 136C52 207 466 208 470 115C473 57 322 11 144 42','stroke-width="6"')), 'oval circle annotation highlight 椭圆 圈画', [512,220]);
await add('double-underline', 'Double underline', 'accent', stroke(path('M30 76Q260 37 1180 65M96 123Q475 81 1095 110','stroke-width="8"')), 'underline highlight annotation line 下划线 标注', [1200,170]);
await add('wavy-underline', 'Wavy underline', 'accent', stroke(path('M24 85Q65 36 106 85T188 85T270 85T352 85T434 85T516 85T598 85T680 85T762 85T844 85T926 85T1008 85T1090 85T1172 85','stroke-width="7"')), 'underline wavy annotation highlight 下划线 波浪', [1200,170]);
await add('brush-highlight', 'Brush highlight', 'accent', path('M44 78L75 43L109 57L1130 31L1171 52L1150 122L1134 138L72 148L29 116Z','opacity=".2"'), 'brush highlight marker brushstroke 荧光笔 高亮 笔刷', [1200,180]);
await add('torn-tape', 'Torn tape', 'accent', path('M40 65L58 42L71 57L86 38L465 38L452 56L473 75L459 95L479 117L465 138L61 145L78 126L48 108L66 88Z','opacity=".25"')+stroke(path('M101 59L121 129M168 57L188 128M235 55L255 127M302 54L322 126M369 52L389 125','stroke-width="1.5" opacity=".25"')), 'tape torn collage paper washi 胶带 拼贴', [512,190]);
await add('zigzag-divider', 'Zigzag divider', 'accent', stroke(path('M24 110L82 44L140 110L198 44L256 110L314 44L372 110L430 44L488 110','stroke-width="5"')), 'divider zigzag line 锯齿 分割线', [512,160]);
await add('dot-divider', 'Dot divider', 'accent', Array.from({length:15},(_,i)=>circle(32+i*32,60,3.8)).join(''), 'divider dots line 分割线 圆点', [512,120]);
await add('corner-brackets', 'Corner brackets', 'accent', stroke(path('M152 60H60V152M360 60H452V152M60 360V452H152M360 452H452V360','stroke-width="5"')), 'brackets corners frame annotation 括号 边框', [512,512]);
await add('organic-blob', 'Organic blob', 'accent', path('M109 91C220 8 433 58 465 210C503 389 320 497 180 447C35 394 14 162 109 91Z','opacity=".18"'), 'blob organic shape backdrop 有机 色块 形状', [512,512]);
await add('confetti-cluster', 'Confetti cluster', 'accent', stroke(path('M112 74L137 107M358 74L337 122M419 225L459 207M66 274L100 291M188 397L170 439M344 399L380 429','stroke-width="9"')+circle(232,56,7,'fill="'+ink+'" stroke="none"')+circle(437,356,7,'fill="'+ink+'" stroke="none"')+circle(72,158,6,'fill="'+ink+'" stroke="none"')), 'confetti celebration doodle 彩纸 装饰', [512,512]);
await add('scribble', 'Scribble', 'accent', stroke(path('M89 354C-13 120 173 64 135 291S224 372 215 157S304 50 298 286S427 359 397 164S445 125 458 282','stroke-width="7"')), 'scribble doodle hand drawn annotation 涂鸦 手绘', [512,512]);

// Curated primary-source downloads. Preserve source bytes and record their hashes.
const hero = [
  ['polka-dots','Hero · Polka dots',2], ['graph-paper','Hero · Graph paper',1.4], ['diagonal-lines','Hero · Fine diagonals',4],
  ['hexagons','Hero · Hexagons',1.5], ['plus','Hero · Plus marks',2], ['wiggle','Hero · Wiggles',2],
  ['topography','Hero · Topography',1.5], ['houndstooth','Hero · Houndstooth',2], ['intersecting-circles','Hero · Intersecting circles',2],
  ['4-point-stars','Hero · Four-point stars',2], ['brick-wall','Hero · Brickwork',1.8], ['texture','Hero · Cross texture',2],
];
for (const [name,title,scale] of hero) {
  const file = resolve(root,'originals',name+'.svg');
  let source;
  try { source = await readFile(file,'utf8'); } catch {
    const direct = ['topography','texture'].includes(name), url = `https://raw.githubusercontent.com/sschoger/hero-patterns/master/svg/${name}.${direct?'svg':'zip'}`;
    const response = await fetch(url); if (!response.ok) throw new Error(`Hero Patterns download failed: ${name} (${response.status})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (direct) source = bytes.toString('utf8');
    else { const zip = await JSZip.loadAsync(bytes), entry = Object.values(zip.files).find(f=>f.name.endsWith('.svg')&&!f.name.startsWith('__MACOSX/')); if(!entry)throw new Error(`Missing source SVG: ${name}`); source = await entry.async('string'); }
    await writeFile(file,source);
  }
  const view = source.match(/viewBox="([^"]+)"/); if (!view) throw new Error(`Missing tile dimensions: ${name}`);
  const [x,y,w,h] = view[1].split(/\s+/).map(Number); if(x!==0||y!==0||!(w>0&&h>0))throw new Error(`Invalid tile: ${name}`);
  const body = source.replace(/^[\s\S]*?<svg\b[^>]*>/,'').replace(/<\/svg>[\s\S]*$/,'').replace(/<title>[\s\S]*?<\/title>|<desc>[\s\S]*?<\/desc>|<!--[^]*?-->/g,'').replace(/#000000\b|#000\b/g,ink);
  await add('hero-'+name,title,'pattern',tile(`<g transform="scale(${scale})">${body}</g>`,f(w*scale),f(h*scale),.2), `hero geometric pattern ${name} background 图案 背景`, [W,H], {creator:'Steve Schoger',sourceUrl:`https://github.com/sschoger/hero-patterns/blob/master/svg/${name}.${['topography','texture'].includes(name)?'svg':'zip'}`,originalFile:`originals/${name}.svg`,originalSha256:hash(source)});
}
for (const item of items) { Object.assign(item,graphicInfo(item)); if(item.category==='accent'&&item.id.includes('arrow'))item.tags=item.tags.filter(tag=>tag!=='curved'||item.id==='curved-arrow'); }
const manifest = {version:2,defaultColor:ink,description:'Transparent, recolorable deck backgrounds and editorial accents',items};
await writeFile(resolve(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const readme = `# Deckleaf patterns and accents\n\n60 transparent SVG resources: 30 patterns, 6 textures, 24 accents.\n\n48 original assets were drawn with deterministic geometry in scripts/build-deck-graphics.mjs and dedicated to the public domain under CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/\n\n12 adapted Hero Patterns by Steve Schoger are CC BY 4.0: https://heropatterns.com/ and https://creativecommons.org/licenses/by/4.0/\nOriginal source SVGs and SHA-256 hashes are preserved in originals/ and manifest.json. Adaptations repeat the tile on a transparent 1600 × 900 canvas, change the ink color, and reduce opacity. Include the author, source, license and adaptation notice when redistributing those assets.\n\nAll assets have transparent backgrounds. Families and use guidance are recorded in manifest.json. The editor supports strength adjustments, repeating-pattern size/angle, saved variants and customized SVG downloads. Default SVGs and original sources remain unchanged. Use Fill slide to place a locked image behind existing slide content; its opacity can be adjusted in the object inspector. Unlock to reposition or remove it. Replace image retains an existing image's dimensions and position. The pack uses SVG image objects, not individually editable vector paths.\n\nResearch references (not redistributed): fffuel (https://www.fffuel.co/) has useful noise, ripple, arrow and shape tools, but https://www.fffuel.co/license/ prohibits redistribution of its generated images. Pattern Monster (https://pattern.monster/) is useful for further exploration; no artwork from it is included in this pack.\n`;
await writeFile(resolve(root,'README.md'),readme);
const zip = new JSZip();
for(const item of items){zip.file(item.file,await readFile(resolve(root,item.file)));if(item.originalFile)zip.file(item.originalFile,await readFile(resolve(root,item.originalFile)));}
zip.file('manifest.json',await readFile(resolve(root,'manifest.json')));zip.file('README.md',await readFile(resolve(root,'README.md')));
await writeFile(resolve(root,'deck-graphics-v1.zip'),await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
console.log(`Deck graphics: ${items.length} SVGs (${items.filter(i=>!i.attributionRequired).length} original, ${hero.length} attributed adaptations).`);
