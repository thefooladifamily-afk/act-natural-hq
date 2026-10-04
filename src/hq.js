// HQ singleton — the v3 "globals" pattern, made explicit.
// Director, VoiceEngine, Ambience, gaze state, XR session state, and
// scene handles (swing pivot, vote cards) live here so the 3D systems can
// reach each other inside useFrame without React re-render storms.
// Overlay-level UI (entered, ended, choice) uses React state in App.jsx.
import { VoiceEngine } from './audio/voice.js'
import { Ambience } from './audio/ambience.js'

export const hq = {
  director: null,          // Director instance (set by App)
  voice: VoiceEngine,
  ambience: Ambience,
  gaze: { current: null },  // {id, kind} set by GazeDwell each frame
  session: { mode: null, presenting: false }, // 'vr' | 'ar' | null
  swing: { pivot: null, seat: null },         // set by Swing.jsx
  voteUI: { show: null, hide: null, visible: false }, // set by VoteCards.jsx
  talkUI: null,                               // {visible} set by TalkConsole.jsx
  screen: null,                               // projection screen (set by Screen.jsx)
  lights: null,                               // room light rig (set by RoomLights.jsx)
  blobs: null,                                // blob-shadow fallback (set by BlobShadows.jsx)
  fx: { list: [] },                           // non-essential FX (governor L6 hides)
  lods: null,                                 // character LOD swap (governor L4; null = skip)
  gl: null,                                   // WebGL renderer (set by GovernorTick)
  governor: null,                             // perf governor (set by GovernorTick)
  overlay: { showEnd: null, setChoice: null },// set by App.jsx
  ratk: null,              // RATK manager (set by SceneUnderstanding.jsx)
}

export function resetHQ() {
  hq.director = null
  hq.gaze.current = null
  hq.session.mode = null
  hq.session.presenting = false
  hq.swing.pivot = null
  hq.swing.seat = null
  hq.ratk = null
}

// Complete the portal transition (Amy's 20-feature #6): hide the vote cards,
// restore the room lights, clear the portal flag. Lives here (not in the
// PortalTransition component) so unit tests / automated QA can drive the
// transition to completion without a React render loop.
export function finishPortalTransition(cards) {
  if (cards) {
    cards.visible = false
    cards.position.set(0, 0, 0)
    cards.scale.setScalar(1)
  }
  // The transition owned the cards' visibility — now the vote UI is done.
  if (hq.voteUI) hq.voteUI.visible = false
  if (hq.lights) { hq.lights.dimTo(1); hq.lights.setWarmth(0) }
  hq.portal = null
}
