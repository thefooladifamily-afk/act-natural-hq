# Screening Room — XR Architecture Map

How Amy's 20-feature module list maps to real files. Every module below is
real, working code — no stubs, no facades.

| Requested module     | Implementation | Notes |
|---|---|---|
| SpatialInteraction   | `src/interaction/UnifiedInput.js` | Single activation funnel: gaze-dwell, pinch, tap, trigger, mouse, touch → one path |
| GazeInteraction      | `src/interaction/GazeDwell.jsx` | Head-gaze raycast, 1.2s dwell, reticle + progress arc (never eye tracking — not exposed in Quest Browser) |
| HandInteraction      | `src/interaction/HandCursors.jsx` | Wrist-joint palm cursors (2 draw calls), hover swell, pinch flash |
| ControllerInteraction| `src/xr/XRSession.jsx` | Session-level selectstart, haptic pulse; gaze-primary (no controller rays by design) |
| SpatialUI            | `src/world/VoteCards.jsx`, `TalkConsole.jsx`, `CaptionCard.jsx`, `ExitSign.jsx`, `LastPickBoard.jsx`, `PhysicalCard.jsx` | World-locked diegetic panels, all inside the 0.6m reach volume |
| SpatialAudio         | `src/audio/ambience.js`, `src/audio/voice.js` | HRTF positional chimes, positional character voices, stereo UI blips |
| SpatialScreen        | `src/world/Screen.jsx` | Physical 2.6×1.46m projection screen, aligned to the loft's screen backing; roll-up/down |
| MovieSelector        | `src/world/VoteCards.jsx` (`screeningRoom.movieSelector`) | Floating animated cards, depth back-plates, gaze+pinch |
| PortalTransition     | `src/world/PortalTransition.jsx` | Cards fly to screen + light dip + glow ring on vote (transform-only) |
| GrabInteraction      | — | Deliberately absent: gaze-primary input doctrine; screen is optimally placed. Pinch = confirm, not grab |
| PerformanceManager   | `src/perf/governor.js`, `GovernorTick.jsx`, `tests/budget-check.mjs` | 13.8ms frame budget, 7-step degradation ladder, build-time asset gates |
| BehavioralEngine     | `src/engine/EventBus.js`, `SessionMemory.js`, `BehaviorEngine.js`, `DirectorResponses.js`, `EngineBridge.jsx` | The Behavioral Cinema Engine — canonical 8-stage pipeline **USER ACTION → EVENT → MEMORY → BEHAVIOR STATE → DIRECTOR RULE → SPATIAL/AUDIO RESPONSE**: real event bus (seq-numbered) → session memory (locked vocabulary DISCOVER/RETURN/INTERACT/DEVIATE/COMPLETE; every INTERACT carries its memory read) → deterministic behavior states (CURIOUS/RETURNING/EXPLORING/UNEXPECTED/COMMITTED; event-driven, no timers) → named director rules (RULE_CURIOUS_REVEAL, RULE_RETURN_ACK, RULE_UNEXPECTED_RECOMPOSE, RULE_COMMIT_ADVANCE, RULE_EXPLORE_INVITE, RULE_REPEAT_ACK) → lighting/audio responses. No randomness, no fake data. |
| JudgeMode            | `src/debug/JudgeMode.jsx` | Hidden overlay (type "judge"): the ACTUAL runtime chain — live event stream, behavior state + reason, last director rule, session memory, measured FPS. Triggering an interaction propagates visibly in real time. |

## Differentiation (binding — Amy's locked wording)

"A browser-native spatial screening room where meaningful user behavior
becomes session memory, influences a cinematic director in real time, and
is reconstructed into a personalized finale."

No "first ever" / "revolutionary" / "nobody has done this" claims anywhere —
interactive cinematic VR and adaptive narrative have existing lineages; our
differentiation is this specific combination, demonstrated live (see the
9-point checklist in Judge Mode, Day 6–7).

## Semantic IDs (scene graph + gaze registry)

`screeningRoom.mainScreen`, `screeningRoom.movieSelector`,
`screeningRoom.vote.swing|chime|cats`, `screeningRoom.talkConsole`,
`screeningRoom.talk.line.*`, `screeningRoom.talk.wrap`,
`screeningRoom.exit`, `screeningRoom.mrToggle`, `screeningRoom.loft`,
`screeningRoom.handCursors`, `screeningRoom.portalRing`,
`screeningRoom.character.gary|marlow`

Characters keep short registry ids (`gary`, `marlow`) — the avatar registry
and `Director.onHotspot()` match on them.

## Deliberately not built (with reasons)

- **Real eye tracking**: not exposed to Quest Browser (privacy). Head-gaze
  raycast + pinch is the compliant substitute; never claim eye tracking.
- **Movable screen / grab**: conflicts with the gaze-primary doctrine; the
  screen sits at the cinematically correct position already.
- **Head-locked mini menu**: discomfort risk; judges score world-locked UI.
- **`screeningRoom.playButton` / `screeningRoom.settings`**: the show is a
  director-driven loop, not a media player — there is no play button or
  settings page by design, and inventing dead buttons would be fake UI.
- **Meta XR Operator**: native-Unity-only. **IWSDK migration**: would be a
  full interaction-layer rewrite; the current @react-three/xr stack is
  working and judge-compliant.
