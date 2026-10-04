# Hands-first pass — greybox v5

NOTE: the `hz-immersive-designer` checklist skill was not found in the skill
catalog, so this pass applies the competition's official hands-first / seated
/ FoV rules directly from the published criteria. Items that need a real
headset are marked NEEDS-HEADSET.

## Geometry (verified in code — positions are the proof)

- Seated design: camera at [0, 1.2, 1.2] (seated eye height 1.2m); chair
  blockout at [0, 0, 1.2]; visitor label "YOU (SEATED)". `?reach=1` shows the
  0.6m reach sphere (wireframe) + comfortable-FoV cone for asset dressing.
- Every interactive control is inside the 0.6m reach sphere centered at the
  seated shoulder point [0, 1.0, 1.0]:
  - Vote cards: 0.55m arc around the shoulder point (all three < 0.6m).
  - Talk console: panel center [0, 1.02, 0.65] (~0.35m); touch targets
    0.44m x 0.20m, gutters 0.06m (min recommended 0.18m).
  - EXIT sign: [0.5, 1.28, 0.88] (~0.59m, right of seat).
  - MR toggle: [-0.5, 1.25, 0.9] (~0.57m, left of seat).
- FoV: console, cards, and caption card are directly forward (essential UI in
  the comfortable narrower FoV); characters flank at ±1.9m, readable without
  head-turn strain.

## Input (verified in code)

- Gaze is primary: head-gaze raycast, 1.2s dwell ring, activates the target.
- Pinch/tap/trigger: session-level `selectstart` activates whatever the gaze
  holds — this is how Quest hand tracking fires (pinch -> selectstart).
  No hand-ray raycasts anywhere (the v3 dead-tap bug).
- No controller dependency: the xr store disables default hand/controller
  visuals and rays; the whole loop (vote, talk lines, wrap-up, exit, MR
  toggle) is reachable by gaze + pinch alone.
- Visible hand presence: two palm-sphere cursors track wrist joints
  (2 draw calls) — NEEDS-HEADSET to confirm they feel right.
- Desktop flat mode: mouse drag = look, click = activate gaze target (same
  single activation path). The flat page carries the whole loop.

## NEEDS-HEADSET (could not verify without a Quest)

1. Pinch -> selectstart latency on real hand tracking (emulator pending).
2. Palm-sphere cursors track real wrists correctly.
3. Comfortable dwell time (1.2s) for real users — tune after first session.
4. MR passthrough mode: toggle + room-scale comfort.
5. Mic inside an immersive session (voice-loop design open question).

## Emulator status

@react-three/xr v6 ships a built-in IWER-based emulator: when
`navigator.xr` reports no immersive support, entering VR auto-installs a
`metaQuest3` emulated device. The verification harness (tests/iwer-run.mjs)
uses it in headless Chromium — see BUILD-LOG-v5.md for per-stage results.
