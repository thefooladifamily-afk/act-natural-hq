// Gaze-interactive registry. Carried over from hq-v3, React-ified.
//
// v3 lesson (the dead-tap bug): gaze is PRIMARY. Tap / trigger / pinch
// always activates whatever the gaze crosshair holds — never a hand-ray
// raycast. This registry feeds the single gaze raycaster in GazeDwell.
//
// SEMANTIC IDS (Amy 2026-10-03): every interactive id uses the
// `screeningRoom.<area>.<thing>` scheme so agent tooling and QA can read
// the scene (e.g. `screeningRoom.vote.swing`, `screeningRoom.talk.wrap`,
// `screeningRoom.exit`, `screeningRoom.mrToggle`). Character hotspots keep
// their short ids ('gary', 'marlow') because the avatar registry and
// Director.onHotspot() match on them.
//
// FOCUS (gaze priority #1): a record may expose `setFocus(bool)` — GazeDwell
// calls it when the head-gaze target changes. Components implement it via
// the useFocusGlow() hook (subtle brighten + grow, zero extra draw calls).
//
// NOTE (perf law): no invisible hit-proxy meshes. Invisible meshes still
// cost draw calls. Register the VISIBLE mesh itself + a radius; the gaze
// raycaster tests the mesh, and the radius is used for forgiving taps.
const items = []

export function registerInteractive(rec) {
  // rec: { id, kind: 'hotspot'|'vote'|'exit'|'mr', object3D, radius, onActivate }
  items.push(rec)
  return () => {
    const i = items.indexOf(rec)
    if (i >= 0) items.splice(i, 1)
  }
}

export function getInteractives() { return items }

export function clearInteractives() { items.length = 0 }
