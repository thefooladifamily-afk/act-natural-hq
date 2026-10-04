# Quest Test Plan — Screening Room (Quest Browser)

**Device:** Amy's Quest 3/3S · **Target date:** October 10, 2026
**Build under test:** Quest profile (`dist-quest/`, see `quest-manifest.json` for exact build)

> This is a Tier-3 smoke test: *load → enter XR → interact → event fires →
> room responds → memory works → finale works*. Visual polish is NOT being
> judged here — only that the pipeline runs on real hardware.

## Before you start

- [ ] Quest charged (or plugged in), controllers nearby (optional — gaze works without them)
- [ ] Quest on the same Wi-Fi you always use, browser up to date
- [ ] The test URL (from Janet — it will be an `https://` link)
- [ ] A way to take notes (phone notes app is fine)

**If the page won't load at all:** stop, note what you saw (blank? error text?
endless spinner?), and report that — a clean "step 1 FAIL" is useful data.

## The 7 steps

### 1. LOAD
Open the test URL in Quest Browser.
- [ ] PASS — landing page appears (title "The Screening Room", ENTER IN VR / PREVIEW buttons visible)
- [ ] FAIL — describe what happened: _______________
- Note roughly how long it took: _____ seconds

### 2. ENTER XR
Look at **ENTER IN VR** and hold your gaze ~1.2s (or point + trigger).
- [ ] PASS — the room appears around you, you feel seated in the screening room
- [ ] FAIL — describe what happened: _______________

### 3. INTERACT
When the vote cards appear, look at one and hold your gaze until it selects
(or point the controller and pull the trigger).
- [ ] PASS — the card visibly responds (brightens/grows) and your choice registers
- [ ] FAIL — describe what happened: _______________

### 4. EVENT FIRES
This is the invisible step made visible: your interaction should cause
*something in the room* to happen right away (a stunt plays, a character
reacts, the screen changes).
- [ ] PASS — something clearly happened because of what I did
- [ ] FAIL — I acted and nothing answered: _______________

### 5. ROOM RESPONDS
The room itself should feel alive to your behavior — lighting shifts, a
character looks at you, sound moves in space.
- [ ] PASS — the room felt responsive, not like a looping video
- [ ] FAIL — it felt canned / unresponsive: _______________

### 6. MEMORY WORKS
Do something, do two or three other things, then do the first thing again.
The room should treat the repeat differently — like it remembers you.
- [ ] PASS — the repeat got a recognizably different response
- [ ] FAIL — the repeat felt identical, no recognition: _______________
- What did you repeat? _______________

### 7. FINALE WORKS
Play through to the end (or as far as the build lets you).
- [ ] PASS — an ending played that felt connected to what I did
- [ ] FAIL — describe what happened: _______________

## Report back to Janet (copy/paste friendly)

```
Quest test — <date>
Build: <paste the "builtAt" line from quest-manifest.json if you have it>
1 LOAD:    PASS / FAIL — 
2 ENTER XR: PASS / FAIL — 
3 INTERACT: PASS / FAIL — 
4 EVENT:    PASS / FAIL — 
5 RESPONSE: PASS / FAIL — 
6 MEMORY:   PASS / FAIL — 
7 FINALE:   PASS / FAIL — 
Headset: Quest 3 / 3S, OS version (Settings > System > Software update): 
Anything weird (freezes, audio glitches, text unreadable): 
```

**For every FAIL, the three things that matter:** what you did, what you
expected, what actually happened. One sentence each is plenty.

## Notes

- **Flat fallback:** if ENTER IN VR says NOT SUPPORTED, tap PREVIEW (NO HEADSET)
  and run the same 7 steps flat — still useful data, say so in the report.
- **Slow load?** If step 1 takes uncomfortably long, try the same URL with
  `?loft=0` at the end (skips the 3.6MB loft model, uses the procedural room)
  and report both timings.
- **Audio:** dialogue/whispers may be quiet — that is a known tuning item, not
  a FAIL unless there is no audio at all.
- This build is a *test slice*, not the final experience. Judge the pipeline,
  not the polish.
