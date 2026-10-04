// respond.js — THE MODEL SEAM for the ACT NATURAL dialogue pipeline.
//
// respondToLine(line, ctx) -> Promise<{ speaker, text, source }>
//
// TODAY (greybox): the response comes from generateResponse(), which is the
// scripted fallback matcher over dialogue/fallback-lines.json. The persona
// files (dialogue/personas/*.md) are already loaded as the system prompts
// that the live model will use.
//
// WHEN THE META MODEL API KEY ARRIVES (zero rework elsewhere):
//   1. Stand up the proxy (see hidden_files/voice-loop-design.md —
//      Cloudflare Worker, keys live there ONLY, never in this page).
//   2. Replace the BODY of generateResponse() below with a fetch() to the
//      proxy, sending { persona, question, history, visitor }.
//   3. Everything else — TTS adapter, viseme driver, captions, the talk
//      console — stays exactly as it is.
// The markers `>>> MODEL INSERTION POINT >>>` show the exact edit site.
import FALLBACK from '../../dialogue/fallback-lines.json' with { type: 'json' }
import garyPersona from '../../dialogue/personas/gary.md?raw'
import marlowPersona from '../../dialogue/personas/marlow.md?raw'

export const PERSONAS = { gary: garyPersona, marlow: marlowPersona }

// The visitor's suggested lines (tap a line -> talk). `trigger` selects the
// fallback family today and becomes the intent label the live model sees.
export const SUGGESTED_LINES = [
  {
    id: 'ask-fame', target: 'gary', trigger: 'protest',
    label: 'GARY: DO YOU WANT TO BE FAMOUS?',
    question: 'Gary, be honest — do you actually want to be famous?',
  },
  {
    id: 'ask-doc', target: 'marlow', trigger: 'general',
    label: 'MARLOW: WHAT IS THIS DOCUMENTARY?',
    question: "Marlow, what's this documentary actually about?",
  },
  {
    id: 'ask-next', target: 'gary', trigger: 'general',
    label: 'GARY: WHAT IS THE NEXT EPISODE?',
    question: "Gary, what's happening in the next episode?",
  },
  {
    id: 'ask-gary', target: 'marlow', trigger: 'general',
    label: 'MARLOW: IS GARY ALWAYS LIKE THIS?',
    question: 'Marlow, be honest — is Gary always like this?',
  },
]

// Round-robin per (speaker, trigger) so repeated taps don't echo.
const _cursor = {}

// Returns { text, id } — id maps to the pre-rendered MP3
// (public/audio/<id>.mp3, cast voices, generated 2026-10-02). voice.js plays
// the file when id is present, TTS/captions when absent. The id uses the
// RESOLVED family so it always matches a generated file.
function pickFallback(speaker, trigger) {
  const fam = (FALLBACK[speaker] && FALLBACK[speaker][trigger]) ? trigger : 'general'
  const set = FALLBACK[speaker][fam]
  const key = speaker + ':' + fam
  const i = (_cursor[key] || 0) % set.length
  _cursor[key] = (_cursor[key] || 0) + 1
  return { text: set[i], id: `fb_${speaker}_${fam}_${i}` }
}

// >>>>>>>>>>>>>>>>>>>>>> MODEL INSERTION POINT >>>>>>>>>>>>>>>>>>>>>>
// Replace this function's BODY when the Meta Model API key arrives.
// Contract: return { speaker, text }. Keep the persona import above — it is
// the system prompt. `history` is [{role:'visitor'|'gary'|'marlow', text}].
// On ANY error: throw — respondToLine() catches and serves the scripted
// cover line (fallback ladder: a judge never sees a glitch).
async function generateResponse({ speaker, question, persona, history, visitorName }) {
  // GREYBOX: scripted fallback is the ONLY response source today.
  // Simulated latency note: the real pipeline masks 2.5-4s with a 1s
  // scripted reaction (see voice-loop-design.md). That mask will be added
  // here, in front of the proxy call, when the key lands.
  void persona; void history; void visitorName
  const line = SUGGESTED_LINES.find((l) => l.id === question.id)
  const trigger = (line && line.trigger) || 'general'
  const pick = pickFallback(speaker, trigger)
  return { speaker, text: pick.text, id: pick.id }
}
// <<<<<<<<<<<<<<<<<<<<<< MODEL INSERTION POINT <<<<<<<<<<<<<<<<<<<<<<

/**
 * The one function the talk console calls.
 * line: a SUGGESTED_LINES entry (or {id, target, question} for free text later).
 * ctx: { visitorName, history, netFail } — netFail=true forces the
 *      network-failure cover line (test hook: ?netfail=1).
 */
export async function respondToLine(line, ctx = {}) {
  const speaker = line.target
  try {
    if (ctx.netFail) throw new Error('simulated network failure')
    const r = await generateResponse({
      speaker,
      question: line,
      persona: PERSONAS[speaker],
      history: ctx.history || [],
      visitorName: ctx.visitorName || null,
    })
    return { speaker: r.speaker, text: r.text, source: 'scripted-fallback' }
  } catch (e) {
    // Fallback ladder: network/LLM failure -> in-character cover line.
    const cover = pickFallback(speaker, 'network_failure')
    return { speaker, text: cover.text, id: cover.id, source: 'cover-line' }
  }
}
