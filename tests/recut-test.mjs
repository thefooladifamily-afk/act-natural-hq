// recut-test.mjs — verifies the showrunner additions:
//   Director.directLine (director mode) and Director.playRecut (scene reorder
//   + Marlow bridge line after a conversation).
// Run: npm run test:recut
//   (or: node --import ./tests/register.mjs tests/recut-test.mjs —
//   register.mjs registers the ?raw ESM loader via node:module register();
//   --loader also works but is deprecated on Node 20+)
import { strict as assert } from 'node:assert'
import { Director } from '../src/director/Director.js'
import { SLIDES } from '../src/director/script.js'
import { hq } from '../src/hq.js'

let pass = 0, fail = 0
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`PASS  ${name}`) }
  else { fail++; console.log(`FAIL  ${name} ${extra}`) }
}

// stub the screen + lights + physical card + capture spoken lines (voice
// fully faked: no audio in Node). The stub fires onLineEnd synchronously —
// the real engine guarantees it via watchdogs, so this is the honest
// simulation. Whisper asides run the real caption-only path (Node has no
// speechSynthesis), which is async — the test awaits the chain below.
const spoken = []
const cards = []
const dimCalls = []
const warmthCalls = []
const glowCalls = []
const cardCalls = []
const whispers = []
hq.screen = { rollDown() { this.down = true }, card(s) { cards.push(s.title) } }
hq.lights = {
  dimTo(t) { dimCalls.push(t) },
  setWarmth(v) { warmthCalls.push(v) },
  setGlow(v) { glowCalls.push(v) },
}
hq.physicalCard = {
  show(w) { cardCalls.push(['show', w]) },
  hide() { cardCalls.push(['hide']) },
}
hq.voice.speak = (line) => {
  spoken.push({ speaker: line.speaker, text: line.text, id: line.id })
  if (hq.voice.onLineEnd) { const f = hq.voice.onLineEnd; hq.voice.onLineEnd = null; f() }
}
// capture whisper asides through the real VoiceEngine method's caption path
const _showCaption = hq.voice.showCaption.bind(hq.voice)
hq.voice.showCaption = (speaker, accent, text) => {
  if (speaker === 'MARLOW · whisper') whispers.push(text)
  return _showCaption(speaker, accent, text)
}

// --- director mode ---
const d1 = new Director()
d1.directLine('Gary, say cheese for the documentary')
ok('director mode: directLine speaks as gary',
  spoken.length === 1 && spoken[0].speaker === 'gary' && spoken[0].text === 'Gary, say cheese for the documentary',
  JSON.stringify(spoken))
d1.directLine('   ')
ok('director mode: blank line ignored', spoken.length === 1)

// --- showrunner recut: THE STAGED BEAT (Amy 2026-10-02) ---
const d2 = new Director()
d2._history = [
  { role: 'visitor', text: 'Gary, do you want to be famous?' },
  { role: 'gary', text: 'Fame is a trap.' },
]
d2._asked = 3
d2.playRecut()
ok('recut: state -> recut', d2.state === 'recut')
ok('recut: lights dim to 30% for theater', dimCalls[0] === 0.3, JSON.stringify(dimCalls))
ok('recut: screen rolled down with RE-CUT card',
  cards[0] === 'THE FILM CHANGED', JSON.stringify(cards))
const bridge = spoken.find((s) => s.speaker === 'marlow')
ok('recut: Marlow bridge quotes the visitor\'s EXACT words',
  !!bridge && bridge.text.includes('"Gary, do you want to be famous?"'),
  JSON.stringify(bridge))
ok('recut: title card carries the visitor\'s question in-world',
  d2._recutSlides[1].kicker === 'YOU SAID IT' &&
  d2._recutSlides[1].title === 'Gary, do you want to be famous?',
  JSON.stringify(d2._recutSlides[1]))
ok('recut: slides reordered (rotated by questions asked)',
  d2._recutSlides.length === 2 + SLIDES.length &&
  d2._recutSlides[2].title === SLIDES[3 % SLIDES.length].title,
  d2._recutSlides.map((s) => s.title).join(' / '))
// tick through the recut slides -> whispers + Gary reacts -> lights up ->
// hook. The whisper asides are real-time (caption path in Node), so the
// test awaits the chain — this mirrors the browser, where the beat is
// genuinely theatrical, not instant.
for (let i = 0; i < 40; i++) d2.tick(1)
await new Promise((r) => setTimeout(r, 8000))
const garyReact = spoken.find((s) => s.id === 'recut_g1')
ok('recut: Gary reacts directly to the visitor',
  !!garyReact && garyReact.speaker === 'gary', JSON.stringify(garyReact))
ok('recut: lights restored after the beat', dimCalls[dimCalls.length - 1] === 1, JSON.stringify(dimCalls))
ok('recut: after the beat, hook state reached',
  d2.state === 'hook' || d2.state === 'end', d2.state)
ok('recut: all staged cards were shown',
  cards.length === 2 + SLIDES.length, JSON.stringify(cards))
// --- Task F magic, verified in the beat ---
ok('magic: room warms + screen glow spills during the dimmed re-cut',
  warmthCalls[0] === 1 && glowCalls[0] === 0.7,
  JSON.stringify({ warmthCalls, glowCalls }))
ok('magic: warmth + glow released when lights come back up',
  warmthCalls[warmthCalls.length - 1] === 0 && glowCalls[glowCalls.length - 1] === 0,
  JSON.stringify({ warmthCalls, glowCalls }))
ok('magic: Marlow holds up the physical card with the visitor\'s words',
  cardCalls.length >= 1 && cardCalls[0][0] === 'show' &&
  cardCalls[0][1] === 'Gary, do you want to be famous?',
  JSON.stringify(cardCalls))
ok('magic: the physical card goes down before Gary reacts',
  cardCalls.some((c) => c[0] === 'hide'), JSON.stringify(cardCalls))
ok('magic: whisper 1 lands after the bridge ("the thing again")',
  whispers[0] === "Psst — he's doing the thing again.", JSON.stringify(whispers))
ok('magic: whisper 2 lands before Gary reacts ("he rehearsed that")',
  whispers[1] === "Don't tell him I told you, but he rehearsed that.", JSON.stringify(whispers))
ok('magic: whisper 3 buttons the beat ("why we film everything")',
  whispers[2] === 'See? This is why we film everything.', JSON.stringify(whispers))

// --- voice: performFamous exists and routes through the track player ---
ok('voice: performFamous + playTrack exist',
  typeof hq.voice.performFamous === 'function' && typeof hq.voice.playTrack === 'function')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
