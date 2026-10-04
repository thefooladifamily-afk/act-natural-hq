// perf-measure-audio.mjs — WORKER C.
// Measures audio asset weights and WebAudio decode cost for the heaviest clips.
// Run: node scripts/perf-measure-audio.mjs
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const AUDIR = path.join(ROOT, 'dist/audio');
const PORT = 8127;

const files = fs.readdirSync(AUDIR).filter(f => f.endsWith('.mp3'))
  .map(f => ({ name: f, bytes: fs.statSync(path.join(AUDIR, f)).size }))
  .sort((a, b) => b.bytes - a.bytes);
const total = files.reduce((s, f) => s + f.bytes, 0);
console.log(`audio files: ${files.length}, total ${(total / 1048576).toFixed(2)} MB`);
console.log('top 10:', files.slice(0, 10).map(f => `${f.name} ${(f.bytes / 1024).toFixed(0)}KB`).join(' | '));

// decode the 3 heaviest in-page (WebAudio decodeAudioData cost)
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', path.join(ROOT, 'dist')], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });

const targets = files.slice(0, 3).map(f => f.name);
const decoded = await page.evaluate(async (targets) => {
  const out = [];
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  for (const name of targets) {
    const tA = performance.now();
    const buf = await (await fetch('./audio/' + name)).arrayBuffer();
    const tB = performance.now();
    const audio = await ctx.decodeAudioData(buf.slice(0)).catch(e => null);
    const tC = performance.now();
    out.push({
      name,
      bytes: buf.byteLength,
      fetchMs: Math.round(tB - tA),
      decodeMs: Math.round(tC - tB),
      durationSec: audio ? Math.round(audio.duration * 10) / 10 : null,
      pcmMB: audio ? Math.round(audio.duration * audio.sampleRate * audio.numberOfChannels * 4 / 1048576 * 10) / 10 : null,
    });
  }
  return out;
}, targets);
console.log(JSON.stringify(decoded, null, 1));

// size comparison: re-encode famous.mp3 at 128k for reference (proposal data only)
try {
  execSync(`ffmpeg -y -v error -i "${path.join(AUDIR, 'famous.mp3')}" -b:a 128k /tmp/famous-128k.mp3`);
  const s = fs.statSync('/tmp/famous-128k.mp3').size;
  console.log(`famous.mp3 192k=${(5070102 / 1048576).toFixed(2)}MB -> 128k re-encode=${(s / 1048576).toFixed(2)}MB (proposal only, not applied)`);
} catch (e) { console.log('re-encode comparison skipped:', String(e).slice(0, 100)); }

await browser.close();
server.kill();
