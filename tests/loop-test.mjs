// loop-test.mjs — greybox v5 verification (Node, no browser).
//
// Exercises the REAL pipeline modules:
//   dialogue/respond.js      (the Model API seam + scripted fallback)
//   dialogue/fallback-lines.json
//   dialogue/visemeMap.js    (text -> Oculus viseme stream)
//   characters/lipsync.js     (morph-target viseme driver + mouth plane)
//   director/Director.js      (the 10-minute loop state machine)
//
// Run: npm run test:loop
//   (or: node --import ./tests/register.mjs tests/loop-test.mjs —
//   register.mjs registers the ?raw ESM loader; --import on raw-loader.mjs
//   alone does NOT register the hooks and will fail on Node 18+)
// Exit 0 = all PASS. Any FAIL prints and exits 1.
import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let pass = 0, fail = 0
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`PASS  ${name}`) }
  else { fail++; console.log(`FAIL  ${name} ${extra}`) }
}

// ---------- respond.js: the seam ----------
const respond = await import('../src/dialogue/respond.js')
const FALLBACK = JSON.parse(await readFile(join(ROOT, 'dialogue/fallback-lines.json'), 'utf8'))

ok('seam: PERSONAS loaded for both characters',
  respond.PERSONAS.gary.includes('GARY') && respond.PERSONAS.marlow.includes('MARLOW'))

ok('seam: 4 suggested lines, targets valid',
  respond.SUGGESTED_LINES.length === 4 &&
  respond.SUGGESTED_LINES.every((l) => (l.target === 'gary' || l.target === 'marlow') && l.trigger && FALLBACK[l.target][l.trigger]))

for (const line of respond.SUGGESTED_LINES) {
  const r = await respond.respondToLine(line, {})
  ok(`seam: respondToLine(${line.id}) -> ${r.speaker}, source=${r.source}`,
    r.speaker === line.target && typeof r.text === 'string' && r.text.length > 3 && r.source === 'scripted-fallback',
    JSON.stringify(r))
}

const netFail = await respond.respondToLine(respond.SUGGESTED_LINES[0], { netFail: true })
ok('seam: ?netfail ladder -> in-character cover line',
  netFail.source === 'cover-line' &&
  FALLBACK[netFail.speaker].network_failure.includes(netFail.text),
  JSON.stringify(netFail))

// round-robin: no immediate echo on repeat taps
const r1 = await respond.respondToLine(respond.SUGGESTED_LINES[0], {})
const r2 = await respond.respondToLine(respond.SUGGESTED_LINES[0], {})
ok('seam: round-robin avoids echo', r1.text !== r2.text, `${r1.text} vs ${r2.text}`)

// ---------- visemeMap.js ----------
const { textToVisemes, validateVisemes } = await import('../src/dialogue/visemeMap.js')
const { VISEMES } = await import('../src/characters/visemes.js')

ok('visemes: contract has 16 names incl jawOpen',
  VISEMES.length === 16 && VISEMES.includes('jawOpen') && VISEMES.includes('PP'))

const seq = textToVisemes('The quick brown fox')
ok('visemes: digraph th -> TH, all names valid',
  validateVisemes(seq) && seq[0].viseme === 'TH',
  seq.slice(0, 4).map((e) => e.viseme).join(','))
ok('visemes: charIndex alignment holds for digraphs',
  seq.length === 'The quick brown fox'.length)

const seq2 = textToVisemes("Gary! Act natural.")
ok('visemes: punctuation -> sil, jaw openness in range',
  validateVisemes(seq2) && seq2.every((e) => e.jaw >= 0 && e.jaw <= 1))

// ---------- lipsync.js: text-driven viseme stream + mouth plane ----------
const { LipSyncEngine } = await import('../src/characters/lipsync.js')
const head = LipSyncEngine.makePlaceholderHead(0.17)
const dictNames = Object.keys(head.morphTargetDictionary)
ok('lipsync: placeholder head carries exact Oculus morph names',
  VISEMES.every((v) => dictNames.includes(v)), dictNames.join(','))

const eng = new LipSyncEngine(head)
const fakePlane = { scale: { x: 1, y: 0.15, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z } } }
eng.attachMouthPlane(fakePlane)
eng.speakText('Gary wants to be famous')
const before = head.morphTargetInfluences.slice()
for (let i = 0; i < 30; i++) eng.update(1 / 30)
const after = head.morphTargetInfluences
const moved = after.some((v, i) => Math.abs(v - before[i]) > 0.01)
ok('lipsync: speakText drives morph influences over time', moved)
ok('lipsync: mouth plane opens with jaw', fakePlane.scale.y > 0.15, `planeY=${fakePlane.scale.y}`)
eng.setCharIndex(5) // boundary event path
eng.update(1 / 30)
ok('lipsync: setCharIndex (TTS boundary) accepted', true)
eng.stopText(); eng.setTalking(false)
ok('lipsync: stopText zeroes influences', head.morphTargetInfluences.every((v) => v === 0))

// attachGLTF upgrade path still present
ok('lipsync: attachGLTF upgrade path exists', typeof eng.attachGLTF === 'function')

// ---------- Director.js: the 10-minute loop state machine ----------
const { Director } = await import('../src/director/Director.js')
ok('director: imports clean (no missing modules)', typeof Director === 'function')

const d = new Director()
ok('director: initial state idle', d.state === 'idle')

// Stub the world: Director only touches hq.* handles, voice, store.
const { hq, finishPortalTransition } = await import('../src/hq.js')
const spoken = []
hq.voice.speak = (line) => { spoken.push(line); if (hq.voice.onLineEnd) { const f = hq.voice.onLineEnd; hq.voice.onLineEnd = null; setTimeout(f, 0) } }
hq.voice.stop = () => {}
// whisperAside is real-time in production (caption beat ~1.8s+); in tests it must be instant like speak
hq.voice.whisperAside = (text, onEnd) => { spoken.push({ speaker: 'marlow', whisper: true, text }); if (onEnd) setTimeout(onEnd, 0) }
hq.screen = { card() {}, rollDown() {}, rollUp() {} }
hq.voteUI = { visible: false }
hq.talkUI = { visible: false }
hq.overlay = { showEnd() {} }

d.start()
ok('director: start() -> watch', d.state === 'watch')
await new Promise((r) => setTimeout(r, 50))
ok('director: watch plays lines in order (marlow first)',
  spoken.length >= 1 && spoken[0].speaker === 'marlow', spoken.map((l) => l.id).join(','))

// Fast-forward: jump through stages via the public entry points.
d.showVote()
ok('director: showVote -> voting, voteUI visible', d.state === 'voting' && hq.voteUI.visible)
d.castVote('swing')
ok('director: castVote(swing) -> stunt, portal triggered',
  d.state === 'stunt' && d.choice === 'swing' && hq.portal && hq.portal.t === 0)
// The portal transition owns voteUI visibility during the card flight;
// simulate the flight completing (PortalTransition.finishPortalTransition).
finishPortalTransition(null)
ok('director: portal completes -> voteUI hidden',
  !hq.voteUI.visible && hq.portal === null)

// skip the swing animation: force the talk stage
d.startTalk()
ok('director: startTalk -> talk, talkUI visible', d.state === 'talk' && hq.talkUI.visible)

await d.askLine(respond.SUGGESTED_LINES[0])
await new Promise((r) => setTimeout(r, 30)) // let the line-end watchdog fire
ok('director: askLine -> character answers in character',
  d.state === 'talk' && spoken.some((l) => l.speaker === 'gary' && l.text.length > 5),
  spoken.slice(-2).map((l) => `${l.speaker}:${l.text.slice(0, 40)}`).join(' | '))
ok('director: history accumulates for the future model call', d._history.length >= 2)

d.endTalk()
ok('director: endTalk -> recut (showrunner), talkUI hidden', d.state === 'recut' && !hq.talkUI.visible)
// the recut replays the reordered slides, then the hook follows. The beat
// is theatrical now (Task F whispers are real-time), so the test awaits
// the full chain — same as the browser, where the beat takes ~25s.
for (let i = 0; i < 40; i++) d.tick(1)
await new Promise((r) => setTimeout(r, 8000)) // whisper 2 + Gary + whisper 3 fire
ok('director: recut -> hook plays marlow then gary teaser',
  (d.state === 'hook' || d.state === 'end') && spoken.some((l) => l.id === 'hook_m1') && spoken.some((l) => l.id === 'hook_g1'))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
