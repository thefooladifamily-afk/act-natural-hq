# Screening Room — Quest QA Checklist (manual, on-device)

Run the automated checklist first (flat mode): enter via **PREVIEW (NO HEADSET)**,
open the console, run `window.__hq.qa.run()`. All non-headset checks must PASS
before this on-device pass.

## Setup
- Quest 3/3S, Quest Browser, charged controllers (for the fallback pass).
- Open the https URL. If WebXR buttons show NOT SUPPORTED, stop — note the
  browser/OS version; do not proceed.

## Hands-first pass (no controllers — pick them up / set them down)
1. **Enter VR** — look at ENTER IN VR, hold gaze 1.2s (or pinch). Room appears.
2. **Gaze focus** — look at each vote card when they appear: the focused card
   visibly brightens and grows slightly. Look away: it eases back.
3. **Gaze dwell select** — hold gaze on THE SWING SCENE for 1.2s: the stunt starts.
4. **Gaze + pinch** — during voting, look at CHIME CHAOS and pinch: same result.
5. **Talk** — when the talk console appears, gaze-hold a line: the character
   answers out loud with lip-sync. Gaze-hold WRAP IT UP: the recut plays.
6. **Exit** — look at the EXIT sign (right of the seat), hold: session ends,
   endcard shows.

## Hand-tracking pass
7. Raise hands: two soft glowing cursors track your palms.
8. Look at a vote card: cursors swell slightly and warm in color (hover).
9. Look + pinch: cursors flash gold (pinch confirmed), stunt starts.

## Controller fallback pass
10. With controllers on: trigger on the gaze target activates it (same as pinch).
11. A short haptic pulse confirms every trigger pull.

## Room / presentation
12. The room is the Filmmaker's Loft (brick, chandeliers, film gear) — NOT the
    old wood room. If you see wood planks, the loft GLB failed: note it.
13. The projection screen shows slides during the watch stage and recut.
14. Captions appear for every spoken line (speech never plays in-headset;
    captions are the channel — by design).

## Performance
15. Open `?perf=1` in flat mode on desktop only — in-headset, watch for
    stutter during the swing stunt. Any sustained judder: note when/where.

## Known headset-only limitations (cannot be verified without a Quest)
- Real hand-joint tracking (flat mode shows no cursors — correct).
- True controller haptics (wired, unverified on device).
- `immersive-ar` passthrough (needs Quest Browser + camera permission).
- 72fps sustained (needs on-device Perfetto via Meta VR CLI).

## If something breaks
- Note the exact step, what you saw, and what you expected.
- In flat mode, `window.__hq.qa.interactives()` lists every gaze target —
  a missing id means its component never registered.
