// Dialogue script — GREYBOX v5. Cold open / vote / stunt carried over from
// hq-v4; new WATCH, TALK, and HOOK stages added for the 10-minute loop.
//
// Beat order: watch -> voting -> stunt -> talk -> hook -> end.
//
// Marlow's lines have real ElevenLabs MP3s (public/audio/<id>.mp3, May voice,
// generated at build time via the connected elevenlabs skill — keys never
// touch the page). Gary's lines use the Web Speech stub on desktop and
// captions-only in XR until Amy picks his ElevenLabs voice.
export const LINES = {
  // ---- WATCH (the screening) ----
  watch_m1: { id: 'watch_m1', speaker: 'marlow', text: "Quiet. The screening's starting. This is the rough cut of the documentary — you're in it now." },
  watch_g1: { id: 'watch_g1', speaker: 'gary', text: "Wait — I'm in it? Nobody told me I'm in it! Marlow, am I in it?" },
  watch_m2: { id: 'watch_m2', speaker: 'marlow', text: "You're the whole thing, Gary. Try to act natural." },
  watch_g2: { id: 'watch_g2', speaker: 'gary', text: "Act natural. Right. I can do that. I'm great at natural." },

  // ---- carried over: the vote intro ----
  vote_g1: { id: 'vote_g1', speaker: 'gary', text: "The cards! Look at the cards, pick one, any one—" },
  vote_m1: { id: 'vote_m1', speaker: 'marlow', text: "Take your time. Gary's dignity is already budgeted." },

  stunt_swing_g1: { id: 'stunt_swing_g1', speaker: 'gary', text: "The SWING scene?! Who voted for— okay. Okay! Physics and I are old friends." },
  stunt_swing_m1: { id: 'stunt_swing_m1', speaker: 'marlow', text: "Camera's rolling, Gary. Give it the full documentary." },
  stunt_swing_g2: { id: 'stunt_swing_g2', speaker: 'gary', text: "WHEEE— okay that's— that's higher than the rehearsal— MARLOW—" },
  stunt_swing_m2: { id: 'stunt_swing_m2', speaker: 'marlow', text: "And that, viewers, is why we do rehearsals. Somebody get the ice pack." },

  stunt_chime_g1: { id: 'stunt_chime_g1', speaker: 'gary', text: "Chime chaos! I can conduct! I took— I watched a video once." },
  stunt_chime_m1: { id: 'stunt_chime_m1', speaker: 'marlow', text: "Gary. The chimes are wind-powered. Put the baton down." },

  stunt_cats_g1: { id: 'stunt_cats_g1', speaker: 'gary', text: "The cats have UNIONIZED? I— I support organized labor, but—" },
  stunt_cats_m1: { id: 'stunt_cats_m1', speaker: 'marlow', text: "Read their demands, Gary. Slowly. They're filming." },

  // ---- TALK (dialogue stage) ----
  talk_m1: { id: 'talk_m1', speaker: 'marlow', text: "That's the stunt, in the can. Now — talk to us. Pick a line. Any line." },
  talk_g1: { id: 'talk_g1', speaker: 'gary', text: "Pick one for me! No wait — pick one for Marlow. No — me. Me!" },

  // ---- RECUT (the staged beat — Amy 2026-10-02) ----
  recut_g1: { id: 'recut_g1', speaker: 'gary', text: "Hey — that's MY line! ...Wait, that's what YOU said. Marlow, the film is stealing from the audience now." },

  // ---- HOOK (return hook) ----
  hook_m1: { id: 'hook_m1', speaker: 'marlow', text: "Same screening room tomorrow. New episode, new vote — and we'll remember you were here." },
  hook_g1: { id: 'hook_g1', speaker: 'gary', text: "Episode 013! 'The One Where Gary Talks to You.' That's the title. I just decided." },

  end_m1: { id: 'end_m1', speaker: 'marlow', text: "That's tonight's show, in the can. Bring a vote tomorrow." },
  end_g1: { id: 'end_g1', speaker: 'gary', text: "I'm okay! Somebody tell my knees I'm okay. See you tomorrow!" },
}

export const STUNT_TITLES = { swing: 'THE SWING SCENE', chime: 'CHIME CHAOS', cats: 'CAT COUP' }

// Watch-stage slide deck (hq.screen.card).
export const SLIDES = [
  { kicker: 'SATISFICTION LABS PRESENTS', title: 'ACT NATURAL', body: 'a reality documentary' },
  { kicker: 'ROUGH CUT — DO NOT DISTRIBUTE', title: 'TONIGHT\'S FEATURE', body: 'Gary. The meadow. One camera.' },
  { kicker: 'STARRING', title: 'GARY', body: 'against his will (his will is a bit)' },
  { kicker: 'A FILM BY', title: 'MARLOW', body: 'Gary had no say in this film' },
]

export const SLIDE_DWELL_S = 6
