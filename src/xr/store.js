// XR store singleton. @react-three/xr v6 owns the WebXR session;
// RATK binds to the same session via gl.xr (no session conflict).
//
// Session features: local-floor is required by default. Everything the
// mission needs is requested as optional (Quest Browser grants what the
// device/OS supports): hand-tracking, hit-test, anchors, plane-detection,
// mesh-detection.
//
// v3 LESSONS (the dead-tap bug + the freeze):
// - hand/controller DEFAULT VISUALS ARE OFF. Gaze is primary; tap/pinch
//   activates whatever the gaze holds. The default xrt hand+ray models cost
//   dozens of draw calls we don't have (perf law: <=80). Hand input still
//   works: Quest fires `selectstart` on pinch, which we listen for at the
//   session level. Visible hand presence = two cheap palm spheres
//   (HandCursors.jsx), not full joint models.
// - foveation: 1 (max fixed foveated rendering) — free perf on Quest.
import { createXRStore } from '@react-three/xr'

export const xrStore = createXRStore({
  handTracking: true,
  hitTest: true,
  anchors: true,
  planeDetection: true,
  meshDetection: true,
  layers: true,        // WebXR composition layers: the documentary screen
                       // rides an XRQuadLayer (Screen.jsx) — the compositor
                       // draws it, ~25% GPU saving on the screen pass.
                       // Unsupported runtimes fall back to the screen mesh.
  depthSensing: false, // skip — costs GPU time, not needed for the slice
  domOverlay: false,   // unsupported in Quest Browser (Feb 2026 table)
  hand: false,         // custom minimal cursors instead (perf law)
  controller: false,   // gaze-first: no controller rays, ever
  foveation: 1,
  emulate: false,      // never bundle-fetch the 7MB XR emulator in prod;
                       // flat mode is the tested fallback (QA checklist)
})

export async function enterVR() {
  return xrStore.enterXR('immersive-vr')
}

export async function enterMR() {
  // Quest Browser: immersive-ar == full-color passthrough.
  try {
    return await xrStore.enterXR('immersive-ar')
  } catch (e) {
    // If AR fails, throw (don't silently fall back to VR).
    throw new Error('Passthrough failed: ' + (e && e.message ? e.message : 'not supported'))
  }
}

export function exitXR() {
  const s = xrStore.getState().session
  if (s) { try { s.end() } catch (e) {} }
}
