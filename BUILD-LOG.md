# The Screening Room — hq-v4 BUILD LOG

**What this is:** WebXR prototype (Three.js 0.186.1 + @react-three/xr 6.6.31 + Meta RATK 0.3.0)
for the Meta competition. **"The Screening Room"** — Marlow's screening room, where she
cuts her documentary about Gary (and Gary dreads going). The shoot happens live in the
flower field outside the window. Owner-named 2026-09-30 (rejected "HQ", "The Backlot",
"The Cutting Room").

**Canon:** the project IS the punchline — Marlow is creating a documentary, Gary is her
unwitting subject. No surveillance/mystery framing anywhere.

## What works (scaffold-complete, untested on headset)

- **The room:** wood floor, walls, beamed ceiling, rug, editing desk with monitor showing
  the "ACT NATURAL — ROUGH CUT" timeline, film cans, poster ("a documentary by MARLOW —
  Gary had no say in this film").
- **The window:** front wall is a 4.6m × 1.7m picture window with mullions + glass. Through
  it: the 3D flower meadow (parallax foreground) + the seamless meadow 360° panorama
  (`public/pano/hq-meadow-360-seamless.jpg`, 2240×1120) on a distant cylinder as the view.
  The pano's hero (oak + rope swing) faces the window; warm-tinted toward golden hour.
- **Show flow:** cold open (Gary panics, Marlow runs the shoot) → vote on 3 stunt cards →
  stunt → endcard. Votes persist in localStorage (`screeningroom.v4`); last night's pick
  shown on the board; winning stunt feeds Amy's reel pipeline.
- **THE SWING SCENE:** Gary straps to the rope-swing seat outside, pumps, releases at the
  top, arcs to the grass, Marlow's button, Gary glides back (known v3 imperfection, kept).
- **Interaction:** gaze-primary — head-gaze raycast, 1.2s dwell ring, tap/trigger/pinch
  (session-level `selectstart`) activates whatever the gaze holds. No hand-ray raycasts
  (the v3 dead-tap bug). Two palm-sphere hand cursors track wrist joints (2 draw calls).
- **WebXR:** `immersive-vr` + `immersive-ar` (full-color passthrough) entry. MR toggle:
  "YOUR ROOM" hides the whole virtual set (Gary + Marlow stay, in your room); "MEADOW"
  keeps it over passthrough. In-world EXIT sign (gaze) ends the session.
- **RATK:** RealityAccelerator bound to the xrt-owned session (`gl.xr`) — plane/mesh
  detection with wireframe overlays (MR only), viewer-space hit-test ring, persistent
  anchor for the last-pick board (restore on later visits; Quest cap 8/site).
- **Audio:** procedural ambience (chimes + breeze + birds), chimes spatialized to the 3D
  chime position. VoiceEngine: per-line MP3s (`public/audio/<id>.mp3`, **Flow-generated
  only — NO ElevenLabs**) as positional audio from the speaker's head; missing file →
  captions only in XR. **speechSynthesis NEVER runs while presenting** (hard rule).
- **Characters:** placeholder capsule + morph-target sphere heads (15 Oculus visemes +
  jawOpen, same names the Blender GLBs will export). `LipSyncEngine.attachGLTF()` swaps
  in real GLBs later with no other code changes. **No final character art invented.**
- **In-world captions** card; **in-VR EXIT**; continuity via localStorage.
- **Perf law honored:** instancing + merged geometry everywhere, shared materials,
  ≤1 shadow light (2048, PCF), no post-processing, dpr ≤1.5, zero per-frame allocation
  (gaze ring uses draw-range trim), ~62 draw calls est., scene tris far under 300K.
- `npm run build` passes. Dev: `npm run dev:https` (self-signed) for Quest Browser —
  WebXR needs a secure context.

## What's stubbed / placeholder

- **Character art:** abstract placeholders. Real Gary/Marlow GLBs land via `modelUrl` prop.
- **Voices:** no MP3s yet — captions-only in XR until Flow lines drop into `public/audio/`.
- **Dialogue:** DRAFT (unchanged from v3 except the rename).
- **Chime/cats stunts:** dialogue only, no animation (swing is the full one).
- **RATK anchors/hit-test:** wired, never exercised on-device (no headset here).
- **Gary's walk-back:** still the v3 glide-lerp; real walk cycle comes with the final rig.

## Perf risks to verify on Quest (`?perf=1` HUD: fps / draw calls / tris, red when over)

1. Panorama texture (2240×1120) + shadow map + 2048 canvas textures — watch GPU memory.
2. 1600-instance grass + 380 flowers: fine on paper, confirm 72fps floor on device.
3. Emulator chunks in the bundle (~5MB total, gzip ~1.8MB) — load-time only, not frame cost.

## Naming (owner-locked 2026-09-30)

"The Screening Room" everywhere user-facing. Rejected: "HQ" (boring), "The Backlot",
"The Cutting Room". Internal code ids (`hq.js`, `hq-environment`) unchanged — not
user-facing.
