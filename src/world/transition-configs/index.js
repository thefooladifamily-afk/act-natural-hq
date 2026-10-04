// Transition configs — pure data. Worker D owns this file. Nothing here touches logic.
//
// Timing curves for camera/scene transitions. Each entry names the ONE place
// that applies it, so the core worker swaps a constant for an import:
//   portalVote    -> PortalTransition.jsx DURATION (0.9s today), SCREEN_POS ring
//   fadeToBlack   -> playHook() / any hard scene cut (no component yet — add with the data)
//   recutDip      -> Director.playRecut() light-dip phase
//   finaleDissolve-> Director.endShow() opening phase
//
// All transitions are transform/light/audio-only: no post-processing, no new
// textures, no new draw calls. Reduced-motion always falls back to an instant cut.
export const TRANSITIONS = {
  portalVote: {
    name: 'Portal Vote',
    description:
      'Vote cards fly to the projection screen, shrink, and dissolve into an expanding light ring while the room lights dip and recover.',
    durationSec: 0.9,
    ease: 'smoothstep',
    appliesTo: 'PortalTransition.jsx — replaces DURATION; ring color 0x9adcff already set',
    at: 'Director.castVote()',
    params: {
      cardFlightTo: [0, 1.62, -1.2],
      shrinkTo: 0.15,
      lightDip: 0.45,
      warmthDip: 0.6,
      ringColor: 0x9adcff,
      ringStartRadius: 0.4,
      ringGrow: 2.2,
    },
    reducedMotion: 'instant-cut',
  },

  fadeToBlack: {
    name: 'Fade to Black',
    description:
      'Clean cinematic cut for scene changes and hook playback. Just light level — the cheapest dissolve there is.',
    durationSec: 0.6,
    ease: 'easeInOutQuad',
    appliesTo: 'RoomLights dimTo path — drive via hq.lights.dimTo over the duration',
    at: 'Director.playHook() and any hard scene cut',
    params: { levelFrom: 1.0, levelTo: 0.0, holdSec: 0.15 },
    reducedMotion: 'instant-cut',
  },

  recutDip: {
    name: 'Recut Dip',
    description:
      'Theatrical dip as Marlow starts re-cutting: lights sink to the hush, then rise again. Pairs with the cinemaHush lighting mood.',
    durationSec: 1.4,
    ease: 'smoothstep',
    appliesTo: 'Director.playRecut() — drive via hq.lights.dimTo dip/recover curve',
    at: 'Director.playRecut() opening',
    params: { dipTo: 0.3, warmthTo: 0.9, glowTo: 0.75 },
    reducedMotion: 'instant-cut',
  },

  finaleDissolve: {
    name: 'Finale Dissolve',
    description:
      'Slow golden rise into the adaptive finale. Pairs with the finaleGlow mood and the finaleRise stinger.',
    durationSec: 2.0,
    ease: 'smoothstep',
    appliesTo: 'Director.endShow() — drive via hq.lights + finaleGlow preset',
    at: 'Director.endShow() opening',
    params: { riseTo: 0.88, warmthTo: 0.55, glowTo: 0.4 },
    reducedMotion: 'instant-cut',
  },
}

// Ease name -> curve. Documented here so the core worker implements each once.
// smoothstep: t*t*(3-2t) (already used in PortalTransition)
// easeInOutQuad: t<.5 ? 2t^2 : 1-((-2t+2)^2)/2
export const EASES = ['smoothstep', 'easeInOutQuad', 'linear']
