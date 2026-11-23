import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DATA } from './store';
import {verifyArchive} from '../src/core/safe-zip';
import {keynoteFontRestoration} from './keynote-text';
import {nativeKeynotePlan} from './keynote-source';
import {createHash} from 'node:crypto';
import type {Deck} from '../src/core/model';
const exec = promisify(execFile);
const keynote = '/Applications/Keynote.app';
const libre = '/Applications/LibreOffice.app/Contents/MacOS/soffice';
export async function converters() {
  return {keynote: await access(keynote).then(() => true, () => false), libreoffice: await access(libre).then(() => true, () => false)};
}
let nativeQueue: Promise<unknown> = Promise.resolve();
export async function exportKeynote(bytes: Buffer, options?:{nativeSource:NonNullable<Deck['nativeSource']>;state:unknown}) {
  const result=nativeQueue.then(async()=>{
    if(!(await converters()).keynote)throw new Error('Keynote is not installed on this device. Export a PowerPoint file, then open it in Keynote on another device.');
    const dir=resolve(DATA,'exports',crypto.randomUUID());await mkdir(dir,{recursive:true});
    let plan:Awaited<ReturnType<typeof nativeKeynotePlan>>=null,warning:string|undefined;
    if(options){try{plan=await nativeKeynotePlan(options.nativeSource,options.state);}catch(e:any){if(e.code!=='ENOENT')throw e;warning='The original Keynote source is unavailable on this server. Compare the converted export with the source.';}}
    if(plan&&!plan.changed)return {key:plan.original.toString('base64'),renderer:'Keynote',fidelity:'native-source',nativeEdits:0};
    if(options&&!plan&&!warning)warning='This edit changes native layout, styles, or paragraph structure. Keynote uses PPTX conversion; compare the export with the source.';
    const source=resolve(dir,plan?'source.key':'source.pptx'),target=resolve(dir,'presentation.key');await writeFile(source,plan?plan.original:bytes,{mode:0o600});
    const fontRestoration=plan?{expected:plan.changed,helpers:plan.helpers,script:plan.script}:await keynoteFontRestoration(bytes);
    const script=`${fontRestoration.helpers}
    on run argv
      set applied to 0
      with timeout of 120 seconds
        tell application "Keynote"
          set importedDoc to open (POSIX file (item 1 of argv))
          try
            ${fontRestoration.script}
            save importedDoc in (POSIX file (item 2 of argv))
          on error errMessage number errNumber
            close importedDoc saving no
            error errMessage number errNumber
          end try
          close importedDoc saving no
        end tell
      end timeout
      return applied
    end run`;
    const scriptPath=resolve(dir,'export.applescript');await writeFile(scriptPath,script,{mode:0o600});
    let applied=0;
    try {await exec('open',['-a',keynote,source],{timeout:10000});const result=await exec('osascript',[scriptPath,source,target],{timeout:130000,maxBuffer:100000});applied=Number(result.stdout.trim())||0;}
    catch {throw new Error('Keynote export did not finish. Check macOS automation access and any open prompts. The exported PPTX copy is preserved.');}
    return {key:(await readFile(target)).toString('base64'),renderer:'Keynote',fidelity:plan?'native-source':'converted',nativeEdits:plan?applied:undefined,fontRestoration:plan?undefined:{expected:fontRestoration.expected,applied},warning};
  });nativeQueue=result.catch(()=>{});return result;
}
export async function convertUpload(bytes: Buffer, filename: string, native = false, signal?: AbortSignal) {
  if (native || /\.key$/i.test(filename)) {
    const result = nativeQueue.then(() => convertInternal(bytes, filename, native));
    nativeQueue = result.catch(() => {}); return result;
  }
  return convertInternal(bytes, filename, native, signal);
}
async function convertInternal(bytes: Buffer, filename: string, native = false, signal?: AbortSignal) {
  const ext = filename.toLowerCase().endsWith('.key') ? '.key' : filename.toLowerCase().endsWith('.pptx') ? '.pptx' : null;
  if (!ext) throw new Error('Only .pptx and .key files are supported.');
  await verifyArchive(bytes);
  signal?.throwIfAborted();
  const dir = resolve(DATA, 'imports', crypto.randomUUID());
  await mkdir(dir, {recursive: true});
  const source = resolve(dir, `source${ext}`), pdf = resolve(dir, 'source.pdf'), pptx = resolve(dir, 'converted.pptx');
  await writeFile(source, bytes, {mode: 0o600});
  let renderer = 'LibreOffice';
  if (ext === '.key' || native) {
    if (!(await converters()).keynote) throw new Error('Keynote is not installed on this device. Export a PDF or PPTX from Keynote, then import it here.');
    // Arguments are passed via argv, never interpolated into AppleScript. Only our uploaded copy is opened and closed.
    const script = `on run argv
      set sourcePath to item 1 of argv
      set pdfPath to item 2 of argv
      set pptxPath to item 3 of argv
      with timeout of 120 seconds
        tell application "Keynote"
          set importedDoc to open (POSIX file sourcePath)
          try
            export importedDoc to (POSIX file pdfPath) as PDF
            if pptxPath is not "" then export importedDoc to (POSIX file pptxPath) as Microsoft PowerPoint
          on error errMessage number errNumber
            close importedDoc saving no
            error errMessage number errNumber
          end try
          close importedDoc saving no
        end tell
      end timeout
    end run`;
    // LaunchServices grants Keynote access to this exact uploaded copy. A bare AppleEvent
    // open can fail with "Operation not permitted" in Keynote's application sandbox.
    try { await exec('open', ['-a', keynote, source], {timeout: 10000}); await exec('osascript', ['-e', script, source, pdf, ext === '.key' ? pptx : ''], {timeout: 130000, maxBuffer: 100000}); }
    catch { throw new Error('Keynote conversion did not finish. Check macOS automation access, file passwords, and open prompts, then try again. You can also export a PDF or PPTX from Keynote. The uploaded original is preserved.'); }
    renderer = 'Keynote';
  } else {
    if (!(await converters()).libreoffice) throw new Error('No converter found. Install LibreOffice or attach a PDF exported from the original app.');
    await exec(libre, [`-env:UserInstallation=file://${resolve(dir, 'lo-profile')}`, '--headless', '--convert-to', 'pdf', '--outdir', dir, source], {timeout: 120000, maxBuffer: 100000, signal});
  }
  return {pdf: await readFile(pdf), pptx: ext === '.key' ? await readFile(pptx) : undefined, renderer,
    nativeSource:ext==='.key'?{provider:'Keynote',id:dir.split('/').at(-1)!,sha256:createHash('sha256').update(bytes).digest('hex')}:undefined,
    warning: ext === '.key' ? 'Source renders come from Keynote. The editable version is converted through PPTX. Review complex effects and animations.' : `Rendered by ${renderer}. Results may differ from PowerPoint. Attach a PDF exported from PowerPoint as the source reference.`};
}
