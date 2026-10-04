// Mix snapshots — pure data. Worker D owns this file. Nothing here touches logic.
//
// One snapshot per Director beat: which ambience bed, which stinger (if any),
// and how far the master ducks. The core worker applies a snapshot by:
//   1. ramping the Ambience nodes to AMBIENCE_PRESETS[name]
//   2. firing the STINGERS[name] entry, if present
//   3. ducking the ambience master to duck.master while the stinger plays
//
// Communicate through the world: transitions arrive as light + sound + motion,
// never as panels, flashes, or debug overlays.
export const MIX_SNAPSHOTS = {
  watch:        { ambience: 'lobby',        stinger: null,               duck: { master: 1.0 } },
  showVote:     { ambience: 'lobby',        stinger: null,               duck: { master: 1.0 } },
  castVote:     { ambience: 'lobby',        stinger: 'choiceCommitted',  duck: { master: 0.35 } },
  playStunt:    { ambience: 'hush',         stinger: null,               duck: { master: 1.0 } },
  startTalk:    { ambience: 'lobby',        stinger: null,               duck: { master: 1.0 } },
  askLine:      { ambience: 'lobby',        stinger: null,               duck: { master: 0.8 } },
  endTalk:      { ambience: 'lobby',        stinger: null,               duck: { master: 1.0 } },
  playRecut:    { ambience: 'hush',         stinger: 'memoryRecall',     duck: { master: 0.7 } },
  endShow:      { ambience: 'celebration',  stinger: 'finaleRise',       duck: { master: 0.5 } },
  exitShow:     { ambience: 'lobby',        stinger: null,               duck: { master: 1.0 } },
}
