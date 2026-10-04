# Quest Performance Runbook — real numbers from the real headset

One page. No estimates, no modeling — you tap, the probe measures, the numbers land in a file.

## What this is

A self-contained measurement probe (`?perf=1&capture=N`) that records a timed
session on your Quest and exports the numbers as JSON. It is **dev-only** —
it does nothing unless the URL contains `?perf=1&capture`.

## Before you run it (one-time, Janet's job)

1. The probe file `scripts/perf-probe/quest-perf-probe.js` is copied to
   `src/perf/quest-perf-probe.js` and imported once in `src/main.jsx`:
   `import './perf/quest-perf-probe.js'`
2. Build passes, probe verified headless (`node scripts/perf-verify-probe.mjs` → PASS).
3. The build is deployed to the live URL **or** served over LAN https
   (`npm run dev:https`) — WebXR needs a secure context either way.

## What you tap (about 3 minutes)

1. On the Quest Browser, open: `https://thefooladifamily-afk.github.io/screening-room-quest/?perf=1&capture=60`
   (use `capture=120` if you want a longer session).
2. A green **PERF CAPTURE** panel appears top-left. The 60-second clock is running.
3. Tap **PREVIEW (NO HEADSET)** — or **ENTER IN VR** if you're doing the XR pass.
4. Use the experience normally: look around, tap the vote cards, trigger Gary's
   performance, do the repeat-action test (do action A, other actions, action A again).
5. **Each time you do something and the room responds:** tap **MARK: ACTION** the
   moment you act, and **MARK: RESPONSE** the moment you see/hear the response.
   (Human tap precision ≈ ±200ms — labeled as such in the data.)
6. At 60s the panel switches to **CAPTURE COMPLETE**. Tap **DOWNLOAD JSON**.
   (If the download doesn't open, the same JSON is readable in the on-screen
   text box — photograph it, or it's saved in the browser under
   `localStorage` key `quest-perf-<timestamp>`.)

## What it records

- **fps avg, frame-time avg / p95 / max** over the capture window (the 72fps-floor verdict)
- **input latency per tap**: pointerdown → next presented frame, in ms
- **your marked pairs**: ACTION → RESPONSE latency as you marked them
- **transfer inventory**: every asset fetched, with byte size and timing
- **memory**: JS heap MB (if the Quest browser exposes it, else "unavailable")
- **renderer string**: proves which GPU/driver actually rendered

## Where the numbers land

1. On-screen panel (in-headset readable)
2. `localStorage['quest-perf-<ISO timestamp>']` on the Quest browser
3. Downloaded file `quest-perf-<timestamp>.json` → send it to Janet
4. Janet appends the measured values to `docs/PERF-AUDIT.md` and fills
   `tests/scene-budget.json` → the build-time budget gate then enforces them

## Pass targets (from the Quest spec)

| Metric | Target |
|---|---|
| FPS avg | ≥ 72 |
| Frame time p95 | ≤ 13.8 ms |
| Draw calls | ≤ 80 |
| Triangles | ≤ 300,000 |
| Texture VRAM total | ≤ 96 MB |

## Rules

- Never run with `?perf=1` during a judge demo or recording — dev only.
- One variable at a time: don't change scenes mid-capture if you want a clean read.
- If anything looks wrong (panel missing, 0 frames), stop and tell Janet —
  don't re-run blindly.
