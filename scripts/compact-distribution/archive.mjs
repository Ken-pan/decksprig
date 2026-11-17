import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {open} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {availableParallelism} from 'node:os';

export async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export function run(command, args, stdio = 'inherit') {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio, windowsHide: true});
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${signal ?? code}`));
    });
  });
}

export async function transformFile(command, args, from, to) {
  const input = await open(from, 'r');
  try {
    const output = await open(to, 'wx');
    try { await run(command, args, [input.fd, output.fd, 'inherit']); }
    finally { await output.close(); }
  } finally { await input.close(); }
}

export async function checkHash(path, expected) {
  if (await sha256(path) !== expected) throw new Error(`Integrity check failed: ${path}`);
}

export async function parallel(items, job) {
  let next = 0;
  let failed = false;
  const results = new Array(items.length);
  const workers = Math.min(items.length, availableParallelism(), 6);
  const settled = await Promise.allSettled(Array.from({length: workers}, async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try { results[index] = await job(items[index]); }
      catch (error) { failed = true; throw error; }
    }
  }));
  const failure = settled.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  return results;
}
