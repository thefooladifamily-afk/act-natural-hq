// Lighting presets — pure data for the screening room's light rig.
// Worker D owns this file. Nothing here touches logic.
//
// Each mood maps to the existing RoomLights API (RoomLights.jsx, via hq.lights):
//   dimTo(level)   -> scales LIGHT_BASE {dir:1.35, hemi:0.55, amb:0.25}
//   setWarmth(v)   -> lerps key-light color neutral 0xffe0b0 -> warm 0xff9e5e
//   setGlow(v)     -> cool screen-glow spill 0xbfd9ff at [0,1.7,-0.9], intensity v*0.85
//
// RoomLights converges automatically (per-frame lerp, ~0.33s time constant),
// so `fade.seconds` is advisory pacing for the Director, not a new mechanism.
// Communicate through the world: no HUD, no flashing, no debug-looking effects.
export const LIGHTING_MOODS = {
  warmWelcome: {
    name: 'Warm Welcome',
    description:
      'Inviting screening-room brightness when the visitor enters and while they browse. Says "come in" without a word.',
    beats: ['start', 'showVote', 'startTalk'],
    lights: { level: 1.0, warmth: 0.3, glow: 0.0 },
    color: { dir: 0xffe0b0, hemiSky: 0xbdd7f2, hemiGround: 0x8a7a5a },
    fade: { seconds: 1.2, ease: 'smoothstep' },
    audioHint: 'lobby',
    why: 'Full light = the room is paying attention to you, not performing for you.',
  },

  cinemaHush: {
    name: 'Cinema Hush',
    description:
      'The room drops into warm amber and the screen spills cool light onto the cast while Marlow re-cuts the film. Tense, intimate, theatrical — the room is holding its breath.',
    beats: ['playRecut', 'playStunt'],
    lights: { level: 0.32, warmth: 0.9, glow: 0.75 },
    color: { dir: 0xff9e5e, hemiSky: 0xbdd7f2, hemiGround: 0x8a7a5a, glow: 0xbfd9ff },
    fade: { seconds: 0.8, ease: 'smoothstep' },
    audioHint: 'hush',
    why: 'Dim + warm + screen glow is the universal cinema grammar for "something important is happening."',
  },

  finaleGlow: {
    name: 'Finale Glow',
    description:
      'Golden lift for the adaptive finale — brighter than the hush, warmer than the welcome. The room celebrates the visitor\'s story back to them.',
    beats: ['endShow', 'exitShow'],
    lights: { level: 0.88, warmth: 0.55, glow: 0.4 },
    color: { dir: 0xffd9a8, hemiSky: 0xcfe0f5, hemiGround: 0x8a7a5a, glow: 0xbfd9ff },
    fade: { seconds: 2.0, ease: 'smoothstep' },
    audioHint: 'celebration',
    why: 'The finale must FEEL different before a word is spoken. Light carries that.',
  },
}

// Mood names in priority-application order (highest priority first):
// the Director resolves overlap by taking the first matching beat list.
export const MOOD_PRIORITY = ['cinemaHush', 'finaleGlow', 'warmWelcome']
