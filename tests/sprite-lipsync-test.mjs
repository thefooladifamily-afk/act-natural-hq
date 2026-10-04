// sprite-lipsync-test.mjs — 2D puppet lip-sync verification (Node, no browser).
//
// Exercises the REAL modules:
//   characters/spriteLipsync.js  (Oculus viseme -> CA mouth driver)
//   dialogue/visemeMap.js        (text -> Oculus viseme stream)
//   public/sprites/*/manifest.json + body/atlas PNGs (exported PSD art)
//
// Run: npm test
//   (or: node --import ./tests/register.mjs tests/sprite-lipsync-test.mjs —
//   register.mjs registers the ?raw ESM loader; --import on raw-loader.mjs
//   alone does NOT register the hooks and will fail on Node 18+)
// Exit 0 = all PASS. Any FAIL prints and exits 1.
import { strict as assert } from 'node:assert'
import { readFile, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SPRITES = join(ROOT, 'public', 'sprites')

let pass = 0, fail = 0
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`PASS  ${name}`) }
  else { fail++; console.log(`FAIL  ${name} ${extra}`) }
}

const { SpriteLipSync, OCULUS_TO_MOUTH, MOUTH_NAMES } =
  await import('../src/characters/spriteLipsync.js')
const { textToVisemes } = await import('../src/dialogue/visemeMap.js')
const { VISEMES } = await import('../src/characters/visemes.js')

// ---------- 1. mapping coverage: every Oculus viseme hits a real mouth ----------
for (const v of VISEMES) {
  if (v === 'jawOpen') continue // jaw is energy, not a mouth sprite
  ok(`map: oculus '${v}' -> CA mouth '${OCULUS_TO_MOUTH[v]}'`,
    MOUTH_NAMES.includes(OCULUS_TO_MOUTH[v]), `(got ${OCULUS_TO_MOUTH[v]})`)
}

// ---------- 2. manifests + art exist for both characters ----------
// QUEST SPEC: ONE mouth atlas per character (never 14 separate textures).
for (const id of ['gary', 'marlow']) {
  const man = JSON.parse(await readFile(join(SPRITES, id, 'manifest.json'), 'utf8'))
  ok(`${id}: body.png exists`, await access(join(SPRITES, id, 'body.png'), constants.R_OK).then(() => true).catch(() => false))
  ok(`${id}: body texture <= 1024px long side`,
    Math.max(man.body.w, man.body.h) <= 1024, `(${man.body.w}x${man.body.h})`)
  const ma = man.mouthAtlas
  ok(`${id}: mouthAtlas declared`, !!ma && ma.w === 2048 && ma.h === 1024,
    ma ? `(${ma.w}x${ma.h})` : '(missing)')
  ok(`${id}: mouth-atlas.png exists`, await access(join(SPRITES, id, ma.file), constants.R_OK).then(() => true).catch(() => false))
  ok(`${id}: no per-mouth PNGs shipped (atlas only)`,
    await access(join(SPRITES, id, 'mouths'), constants.R_OK).then(() => false).catch(() => true))
  let mouthCount = 0
  const seenUV = new Set()
  for (const name of MOUTH_NAMES) {
    const e = man.mouths[name]
    const inRange = e && e.cx >= 0 && e.cx <= 1 && e.cy >= 0 && e.cy <= 1 && e.w > 0 && e.h > 0
    const uv = e && e.uv
    const uvOk = Array.isArray(uv) && uv.length === 4 &&
      uv[0] >= 0 && uv[2] <= 1 && uv[0] < uv[2] &&
      uv[1] >= 0 && uv[3] <= 1 && uv[1] < uv[3]
    const key = uvOk ? uv.join(',') : 'bad'
    const dup = seenUV.has(key)
    seenUV.add(key)
    if (inRange && uvOk && !dup) mouthCount++
    else console.log(`FAIL  ${id}: mouth '${name}' anchor/uv bad (dup=${dup})`)
  }
  ok(`${id}: all 14 mouths have valid anchors + unique atlas UVs`, mouthCount === 14, `(${mouthCount}/14)`)

  // VRAM budget: body + atlas, RGBA8 with mipmaps (x1.333), per character
  const bodyMB = (man.body.w * man.body.h * 4 * 1.333) / 1048576
  const atlasMB = (ma.w * ma.h * 4 * 1.333) / 1048576
  console.log(`      ${id}: VRAM body ${bodyMB.toFixed(1)}MB + atlas ${atlasMB.toFixed(1)}MB = ${(bodyMB + atlasMB).toFixed(1)}MB`)
  globalThis.__vram = (globalThis.__vram || 0) + bodyMB + atlasMB
}

// ---------- 2b. combined VRAM budget: both characters <= 96MB ----------
ok('VRAM: both characters combined <= 96MB', globalThis.__vram <= 96, `(${globalThis.__vram.toFixed(1)}MB)`)

// ---------- 3. text stream never emits an unmappable viseme ----------
const CORPUS = [
  'Gary never asked to be famous.',
  'Marlow is making a documentary about Gary.',
  "Let's roll that back.",
  'Did you hear what they just said about me?',
  'Please don\'t post that.',
]
let bad = 0
for (const line of CORPUS) {
  for (const { viseme } of textToVisemes(line)) {
    if (viseme !== 'jawOpen' && !OCULUS_TO_MOUTH[viseme]) { bad++; console.log(`FAIL  unmappable viseme '${viseme}' in "${line}"`) }
  }
}
ok('corpus: every emitted viseme maps to a mouth sprite', bad === 0, `(${bad} bad)`)

// ---------- 4. SpriteLipSync driver behavior ----------
{
  const s = new SpriteLipSync()
  ok('idle: Neutral mouth', s.currentMouth === 'Neutral')
  s.setExpression('Smile')
  ok('expression: Smile holds when idle', s.currentMouth === 'Smile')
  s.setExpression('Surprised')
  ok('expression: Surprised holds when idle', s.currentMouth === 'Surprised')
  s.setExpression(null)

  s.speakText('Gary never asked to be famous.')
  const seen = new Set()
  for (let i = 0; i < 120; i++) { s.update(1 / 13); seen.add(s.currentMouth) }
  ok('text: mouth moves off Neutral while speaking', seen.size > 1 && seen.has('Neutral') === false || seen.size > 2, `(${[...seen].join(',')})`)
  ok('text: all spoken mouths are real sprites', [...seen].every((m) => MOUTH_NAMES.includes(m)))
  s.stopText(); s.setTalking(false)
  ok('stop: back to Neutral', s.currentMouth === 'Neutral' && !s.talking)

  // analyser path without real audio -> procedural fallback, must not throw
  s.attachAnalyser(null)
  s.update(0.1); s.update(0.1)
  ok('analyser-fallback: produces a valid mouth', MOUTH_NAMES.includes(s.currentMouth))
  s.detachAnalyser()
  ok('detach: resets to Neutral', s.currentMouth === 'Neutral' && s.analyser === null)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
