// Transition stingers — pure data. Worker D owns this file. Nothing here touches logic.
//
// Every stinger reuses an EXISTING playback path; no new machinery:
//   {kind:'file'}       -> decoded via VoiceEngine's trackCache (audioLoader path),
//                         like famous.mp3 today. Volume/fade applied on the node.
//   {kind:'chimePluck'} -> Ambience.pluck(freq, when, vol) — procedural, zero assets.
//
// IMPORTANT perf note: famous.mp3 is ~4.9MB. The finale stinger must reuse the
// single decoded buffer (VoiceEngine.trackCache), never re-decode per play.
export const STINGERS = {
  choiceCommitted: {
    name: 'Choice Committed',
    description:
      'A soft whisper under the vote-commit beat. The room acknowledges the decision — intimate, not triumphant.',
    kind: 'file',
    file: 'whisper_thing.mp3', // public/audio/whisper_thing.mp3 (already shipped)
    volume: 0.5,
    fadeInMs: 80,
    fadeOutMs: 600,
    duckAmbienceTo: 0.35,
    duckHoldSec: 1.5,
    at: 'Director.castVote() — fires once the vote cards begin their portal flight',
    why: 'The whisper answers the click with world-sound, not a UI ping.',
  },

  memoryRecall: {
    name: 'Memory Recall',
    description:
      'Two soft chime plucks — the audible equivalent of the room recognizing you. Fires with the repeat/recognition rule.',
    kind: 'chimePluck',
    notes: [880.0, 1046.5], // pentatonic pair, matches the Ambience scale
    volume: 0.12,
    spacingSec: 0.32,
    at: 'engine/DirectorResponses.js — RULE_RETURN_ACK / RULE_REPEAT_ACK',
    why: 'Recognition must be FELT. The same two notes every time become a signature: "the room remembers me."',
  },

  finaleRise: {
    name: 'Finale Rise',
    description:
      'Famous swells under the adaptive finale — the visitor\'s story gets its own soundtrack entrance.',
    kind: 'file',
    file: 'famous.mp3', // public/audio/famous.mp3 — reuse the cached buffer, never re-decode
    volume: 0.7,
    fadeInMs: 2000,
    fadeOutMs: 0,
    duckAmbienceTo: 0.5,
    duckHoldSec: 6,
    at: 'Director.endShow() — fires as the finale lighting lifts',
    why: 'The signature track entering IS the finale signal. No title card needed.',
  },
}
