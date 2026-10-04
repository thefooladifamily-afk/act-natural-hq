// visemeMap.js — text -> Oculus viseme timing stream.
//
// The 15 Oculus visemes + jawOpen are the morph-target contract shared with
// the Blender build (see characters/lipsync.js). This module maps spoken
// text to a per-character viseme sequence so the TTS adapter's onBoundary()
// callbacks (or a fixed chars/sec estimate when the backend gives no
// timings) drive the placeholder mouth with correct timing.
//
// Provenance: grapheme->viseme heuristics, good enough for a greybox stub.
// The real build will use Rhubarb/alignment JSON; the consumer contract
// (setViseme(name, weight) per tick) does not change.
import { VISEMES } from '../characters/lipsync.js'

// Digraphs first, then single letters. 'sil' = rest/pause (spaces).
const DIGRAPH = { th: 'TH', ch: 'CH', sh: 'CH', wh: 'ou', ph: 'FF' }
const LETTER = {
  a: 'aa', e: 'E', i: 'ih', o: 'oh', u: 'ou', y: 'ih',
  p: 'PP', b: 'PP', m: 'PP',
  f: 'FF', v: 'FF',
  t: 'DD', d: 'DD', n: 'nn', l: 'DD',
  k: 'kk', g: 'kk', c: 'kk', q: 'kk', x: 'kk',
  s: 'SS', z: 'SS', j: 'CH',
  r: 'RR', w: 'ou',
  h: 'sil',
}
const OPEN = { aa: 1, E: 0.8, oh: 0.85, ou: 0.7, ih: 0.5 } // jaw openness per viseme

// text -> [{ ch, viseme, jaw }] — one entry per source character (digraphs
// consume two chars but emit one viseme; the second char maps to same viseme
// so charIndex lookups stay aligned).
export function textToVisemes(text) {
  const out = []
  const s = (text || '').toLowerCase()
  let i = 0
  while (i < s.length) {
    const two = s.slice(i, i + 2)
    if (DIGRAPH[two]) {
      out.push({ ch: two, viseme: DIGRAPH[two], jaw: OPEN[DIGRAPH[two]] || 0.5 })
      out.push({ ch: '', viseme: DIGRAPH[two], jaw: OPEN[DIGRAPH[two]] || 0.5 })
      i += 2
      continue
    }
    const c = s[i]
    if (c === ' ' || c === '\n') { out.push({ ch: ' ', viseme: 'sil', jaw: 0.15 }); i++; continue }
    const v = LETTER[c] || 'sil'
    out.push({ ch: c, viseme: v, jaw: OPEN[v] !== undefined ? OPEN[v] : 0.55 })
    i++
  }
  return out
}

// Sanity: every emitted viseme name must be a real Oculus morph name.
export function validateVisemes(seq) {
  const set = new Set(VISEMES)
  return seq.every((e) => set.has(e.viseme))
}
