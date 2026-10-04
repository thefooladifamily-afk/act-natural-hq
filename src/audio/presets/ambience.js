// Ambience presets — pure data. Worker D owns this file. Nothing here touches logic.
//
// Targets for the existing procedural WebAudio Ambience (audio/ambience.js):
//   masterGain -> Ambience.master.gain           (default 0.85)
//   breeze     -> _breeze() gain / lowpass Hz    (defaults 0.05 / 420Hz)
//   chimes     -> pluck() volume + tick() density (default vol 0.16, pentatonic)
//   birds      -> chirp() density in tick()       (enabled flag + density scale)
//   blip       -> blip() peak volume             (default 0.18)
//
// All ramps go through setTargetAtTime on the live nodes — no new machinery.
// Communicate through the world: sound cues, never HUD pings.
export const AMBIENCE_PRESETS = {
  lobby: {
    name: 'Lobby',
    description: 'Bright, airy default — breeze, regular chimes, birds. The room is alive and relaxed.',
    beats: ['start', 'showVote', 'startTalk', 'endTalk'],
    masterGain: 0.85,
    fade: { seconds: 1.5, ease: 'smoothstep' },
    breeze: { gain: 0.05, filterHz: 420 },
    chimes: { enabled: true, volume: 0.16, density: 1.0 },
    birds: { enabled: true, density: 1.0 },
    blip: { volume: 0.18 },
  },

  hush: {
    name: 'Hush',
    description: 'Recut/tension bed — breeze thins, chimes go sparse and soft, birds leave. The room holds its breath.',
    beats: ['playRecut', 'playStunt'],
    masterGain: 0.7,
    fade: { seconds: 1.0, ease: 'smoothstep' },
    breeze: { gain: 0.03, filterHz: 300 },
    chimes: { enabled: true, volume: 0.1, density: 0.4 },
    birds: { enabled: false, density: 0 },
    blip: { volume: 0.12 },
  },

  celebration: {
    name: 'Celebration',
    description: 'Finale lift — brighter chimes, denser birds, air opens up. The room remembers and celebrates.',
    beats: ['endShow', 'exitShow'],
    masterGain: 0.9,
    fade: { seconds: 2.5, ease: 'smoothstep' },
    breeze: { gain: 0.05, filterHz: 520 },
    chimes: { enabled: true, volume: 0.18, density: 1.5 },
    birds: { enabled: true, density: 1.2 },
    blip: { volume: 0.2 },
  },
}
