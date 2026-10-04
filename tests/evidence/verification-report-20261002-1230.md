# Greybox v5 — 12:30 CDT verification report (2026-10-02)

Checkpoint: 12:30 PM CDT. Verdicts below are module-level (Node, real source
modules) — live browser rendering could not be captured: this sandbox's
Chromium build has broken headless output (--screenshot/--print-to-pdf write
nothing, --dump-dom returns empty for module pages) and CDP WebSocket would
not connect. No visual evidence was obtainable in-session.

## Item 1 — Core loop (enter → watch → talk) — PASS (module level)
- `tests/loop-test.mjs`: 29/29 PASS (log: loop-test-20261002-1228.log).
- Verified: dialogue seam (4 suggested lines → in-character scripted
  fallback), netfail cover-line ladder, round-robin no-echo, Oculus viseme
  contract (16 names incl. jawOpen), text→viseme timing alignment,
  LipSyncEngine morph-target driver + GLB upgrade path, Director state
  machine idle→watch→voting→stunt→talk→recut→hook→end.
- Caveat: characters are the placeholder contract (capsule + sphere head
  with real morph targets), NOT the Gary/Marlow sculpts — no GLB exists in
  the repo yet. Voice is WebSpeech TTS on desktop / captions-only in XR
  (Gary's ElevenLabs voice still TBD — Amy's pick).

## Item 2 — Gary lip-syncs "Famous" — PASS (pipeline wired, audio not heard)
- `famous-master.wav` (40MB, 16-bit/48kHz) copied to `public/audio/famous.wav`
  and present in `dist/audio/famous.wav`.
- New `VoiceEngine.playTrack()` / `performFamous()` plays it through the
  EXISTING analyser-driven lip-sync path (`_playFile` → `attachAnalyser`):
  Gary's jaw + viseme cycling follow the real song amplitude. Trigger: HUD
  button "♪ GARY PERFORMS FAMOUS".
- Not verified: actual audible playback + mouth motion on screen (no
  browser audio/visual capture available).

## Item 3 — Director mode (typed line → Gary performs) — PASS (module level)
- `Director.directLine(text)` → `hq.voice.speak({speaker:'gary', text})` →
  TTS viseme stream. HUD has a text input + "GARY SAYS IT" button.
- `tests/recut-test.mjs`: directLine speaks as Gary; blank input ignored.
- Not verified: on-screen typing interaction (no browser capture).

## Item 4 — Tablet prop with playing video texture — FAIL
- Cause: not implemented; no tablet mesh exists in the world, and there is
  no local video file in the repo to texture it with (only audio + one pano
  JPG). Building this needs a video asset + prop work — out of scope for
  this checkpoint.

## Item 5 — Showrunner recut — PASS (module level)
- `Director.playRecut()` runs automatically at `endTalk`: Marlow speaks a
  bridge line naming the visitor's last question, the screen rolls back
  down with a "RE-CUT — TONIGHT ONLY" card, the slide deck replays in an
  order rotated by the number of questions asked, then the normal hook runs.
- `tests/recut-test.mjs`: 9/9 PASS — state transitions, bridge-line topic,
  slide reorder, full recut→hook→end chain (log: recut-test-20261002-1228.log).
- Not verified: on-screen visual of the recut (no browser capture).

## Build state
- `npm run build` clean (2.25s). `dist/` current with all changes above.
- Served locally at http://localhost:8901 (python http.server, this session).
- No deployment, no public URL (distribution freeze honored).

## Files changed this session
- `src/audio/voice.js`: +playTrack/+performFamous
- `src/director/Director.js`: +directLine, +playRecut/+_tickRecut, endTalk→recut
- `src/ui/Overlay.jsx`: Hud director input + Famous button
- `public/audio/famous.wav`: the master (copied, not modified)
- `tests/recut-test.mjs`: new (9 tests)
- `tests/loop-test.mjs`: 2 assertions updated for endTalk→recut→hook flow
