# KNOWN-GOOD CHECKPOINT — 2026-10-03 (P1 finale + Quest defect fixes)

## What this is
The vertical slice for the ONE canonical event pipeline is FROZEN.
DOM (mouse/touch), gaze, hand, and controller inputs all converge into:

  INPUT → EVENT → MEMORY → BEHAVIOR STATE → DIRECTOR → RESPONSE

Plus ONE behavior-dependent finale branch (P1) and Quest defect fixes.

## Verified state (all green on this exact build)
- `npm run build` — clean, budget check passes
- `npm test` — 37/37 unit tests pass
- `node qa_clean.mjs` — 31/31 PASS (30 + new finaleBranch), 2 headset-only skips, 0 unexpected console errors
- `node dom_accept3.mjs` — 18/18 PASS (real DOM button clicks → full 6-step pipeline)
- `node touch_accept.mjs` — PASS (touchscreen tap → INTERACT source=touch → pipeline)

## P1 FINALE BRANCH (Amy's order)
`selectFinale()` reads session memory (≥3 facts: returnCount, mostReturnedTarget,
interactionCount, repeatCount, discoveredCount, dominantState) → branch:
- HOMECOMING (returnCount ≥ 1): RULE_FINALE_HOMECOMING → memory-glow lighting
  (dim 1.1, warmth 0.5) + ascending triple-blip + endcard "THE ROOM REMEMBERS YOU"
  naming the actual target/count.
- DEFAULT (no returns): RULE_FINALE_DEFAULT → gentle resolve + standard endcard.
Fired via `fireFinale()` through the canonical pipeline (DIRECTOR_RULE carries
the facts for Judge Mode traceability). Acceptance test `finaleBranch` in QA:
session A (RETURN) → HOMECOMING with traceable reason; session B (no RETURN)
→ DEFAULT with traceable reason.

## QUEST DEFECT FIXES (Amy's headset test)
1. **Taps (DEFECT 1)**: `DesktopControls.jsx` was mouse-only. Added pointer
   events + tap-to-select (raycast from tap point, not center gaze). Touch
   taps now activate 3D interactives directly via `activate(hit, 'touch')`.
2. **RATK wireframes in VR (DEFECT 2A)**: `ratk.js` `showOverlays` defaulted
   true; `SceneUnderstanding` now gates overlays to AR-only (`hq.session.mode
   === 'ar'`) and flips existing overlays per-frame.
3. **LoftRoom timeout (DEFECT 2B)**: 12s load timeout triggers onError →
   procedural fallback. `hq.loft.path` records active room ('loft' |
   'fallback' | 'timeout' | 'fallback-procedural') for diagnosability.
4. **Judge Mode on Quest**: `?judge=1` URL param alternative to keydown sequence.
5. **GazeDwell allocation**: replaced per-frame `.clone()` with module temps.

## Files changed (P1 + defects)
- `src/engine/DirectorResponses.js` — selectFinale(), fireFinale(), FINALE_RULES
- `src/director/Director.js` — exitShow() calls fireFinale(), passes to showEnd
- `src/App.jsx` — showEnd accepts finale info
- `src/ui/Overlay.jsx` — EndCard homecoming variant
- `src/qa/checklist.js` — finaleBranch test; back-to-back timing fix for 4s gap
- `src/interaction/DesktopControls.jsx` — pointer events + tap-to-select
- `src/interaction/GazeDwell.jsx` — zero-allocation raycast
- `src/xr/ratk.js` — showOverlays default false
- `src/xr/SceneUnderstanding.jsx` — AR-only overlay gating
- `src/world/LoftRoom.jsx` — 12s timeout + path telemetry
- `src/world/Meadow.jsx` — RoomShell path telemetry
- `src/debug/JudgeMode.jsx` — ?judge=1 param

## Wireframe verdict (audit: DO NOT GUESS)
Seat.jsx wireframe is gated behind `?reach` (OFF by default) — not the source.
RATK overlays were the likely source but are now AR-gated. If wireframes
persist on Amy's retest, needs on-device console evidence.

**Do NOT push or deploy without Amy's explicit approval.**
