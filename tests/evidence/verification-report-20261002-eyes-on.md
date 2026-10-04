# EYES-ON VERIFICATION REPORT — 2026-10-02 ~18:10 CDT
Problem tracker: #1 (nothing eyes-verified) and #6 (take-it-away test).

## Verdict
- **#1 EYES-VERIFIED: PASS.** First real pixels of the Screening Room captured — 7 screenshots.
- **#6 TAKE-IT-AWAY: PASS.** Full loop completes with all network/AI failed (`?netfail=1`): enter → watch → voting → talk (in-character cover line) → recut → hook → end.

## Screenshots (tests/evidence/)
| File | What it proves |
|---|---|
| `20261002-a1-intro.png` | Intro overlay renders: THE SCREENING ROOM, 3 entry buttons |
| `20261002-a2-room-entry-vr.png` | **Emulated VR session** (IWER Quest 3): screen rolled down playing "SATISFICTION LABS PRESENTS / ACT NATURAL", Gary caption "Wait — I'm in it? Nobody told me I'm in it!", meadow through window |
| `20261002-b-screen-midplay-vr.png` | VR mid-screening: Gary caption "Act natural. Right. I can do that. I'm great at natural." — dialogue advancing |
| `20261002-c-room-entry-flat.png` | Flat preview: **Gary (toon, grey hair/blue shirt) and Marlow (strawberry-blonde, white blouse/jeans) flanking the screen**, Marlow caption "You're the whole thing, Gary. Try to act natural.", HUD with director input + GARY SAYS IT + FAMOUS buttons |
| `20261002-d-hud-director-input.png` | HUD director-mode input with typed line; screen rolled up (voting state), meadow/wind-chimes visible |
| `20261002-e-takeitaway-end.png` | **The wow moment, on screen**: RE-CUT card "YOU SAID IT / Gary, be honest — do you actually want to be famous? / the film re-cuts itself around your words" + Marlow bridge caption quoting the visitor's exact words |
| `20261002-f-recut-hook-end.png` | Hook: Marlow "That's tonight's show, in the can. Bring a vote tomorrow.", deck replaying |

## Take-it-away trace (?netfail=1)
`watch@8s → voting@18s → voted:chime → talk@23s → talk@24s (answer served) → endTalk → recut@25s → hook → end`
- Talk response with network failed: Gary: *"The network goblins ate your words. Say it again — slower, l…"* (source: `cover-line` fallback ladder — in character, no glitch)
- Recut deck order with 1 question asked: `[THE FILM CHANGED, <visitor question>, TONIGHT'S FEATURE, GARY, MARLOW, ACT NATURAL]` — conversation-derived cards prepended, remaining slides rotated. Genuine reorder, verified against `src/director/script.js` SLIDES.
- Recut staging confirmed in build: lights dim to 0.3 → RE-CUT card → YOU SAID IT card → Marlow bridge line quoting visitor → slides replay → Gary react beat → hook → end.

## Corrections to the 12:30 checkpoint
- Characters are **NOT placeholder capsules**. `dist/hybrid/` contains `gary.glb` + `marlow.glb` with atlases; the screenshots show finished toon Gary/Marlow. (The "no GLB in repo" claim was wrong.)
- The wow-moment staging (lights dim, quote-back, Gary react) is **already implemented** in `Director.playRecut`/`_recutGaryReact` — not just planned.

## Environment notes (for the next run)
- Sandbox Chromium (`/opt/meta-chromium/chrome` 152) has **zero network access** (loopback + public both blocked; curl/node unaffected). Workaround used: Playwright `page.route('**/*')` serving `dist/` from disk via Node — no dev server needed.
- Playwright CDN download fails repeatedly (connection reset at ~90%); used sandbox Chromium via `executablePath` instead.
- Headless SwiftShader renders at a fraction of real fps; `DirectorTick` clamps dt to 0.05s, so frame-driven slide dwells take ~100x longer than wall-clock. Workaround: pump `Director._tickRecut(dt)` manually in the take-it-away test. **On-device timing still unverified** — needs the Quest.
- Test harnesses kept: `tests/xr-verify.mjs` (3-pass: IWER VR + flat + take-it-away), `tests/recut-complete.mjs` (recut→hook→end with manual tick pumping).

## Still open (not this task)
- Tablet prop (item 4) — still unbuilt.
- 72fps proof — needs Quest hardware (problem #5).
- "Famous" lip-sync seen/heard — pipeline wired, not yet eyes-verified singing.
- Endcard visual — state machine reaches `end`; endcard render not screenshotted (timing artifact only).
