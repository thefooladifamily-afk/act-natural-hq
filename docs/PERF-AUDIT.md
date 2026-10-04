# PERF-AUDIT.md — measured numbers only

**Owner:** Worker C (performance). **Scope:** measure and propose; no runtime behavior changes.
**Snapshot:** 2026-10-03 ~18:15–18:25 UTC. dist built 2026-10-03 17:48:48 UTC.
**Method:** Playwright 1.63 headless Chromium (`chromium_headless_shell-1243`),
local `python http.server`, `?perf` HUD off. Headless uses SwiftShader software
rendering — FPS and absolute wall-times from this rig are **not device numbers**;
the loading *structure* (what fetches, in what order) is real. Device numbers
are pending the Quest harness (`scripts/perf-probe/`, `docs/QUEST-PERF-RUNBOOK.md`).

No claim below is made without a measurement. Ranges are reported where the rig
was noisy.

## 1. Bundle & deploy inventory (measured)

| Artifact | Raw | Gzip | Notes |
|---|---|---|---|
| `dist` total | 31 MB | — | full deploy weight |
| `assets/index-DN8P7Lku.js` (main, the only script `index.html` loads) | 1,417,178 B | 392,952 B | |
| `assets/index-DgNFaH1f.css` | 2,261 B | — | |
| `dist/index.html` | 516 B | — | one module script, one stylesheet, **zero preload hints** |
| `dist/audio` (71 mp3) | 9.60 MB | — | |
| `dist/hybrid` (2 GLB + face/atlas PNG) | 5.2 MB | — | |
| `dist/rooms/room-bake.glb` | 3.59 MB | — | |
| `dist/textures` | 2.5 MB | — | |
| `dist/pano/hq-meadow-360-seamless.jpg` | 0.96 MB | — | measured 2240×1120 px |
| `dist/sprites` | 1.1 MB | — | |

**Gated dev-only JS (measured, correctly lazy — zero runtime cost in prod):**

| Chunk | Raw | Gzip | Reachability |
|---|---|---|---|
| `emulate-BSyrLhGf.js` (XR emulator) | 1,364,173 B | 346,754 B | dynamic `import()`, gated by `emulate:false` — **not fetched** in scene waterfall |
| `music_room` / `living_room` / `meeting_room` / `office_large` / `office_small` (room-scan data) | 4.65 MB combined | — | lazy deps of the emulate chunk only — **not fetched** |
| **Gated total** | ~6.0 MB | — | deploy weight only |

The build-time budget gate (`tests/budget-check.mjs`: char GLB ≤45K tris, ≤6 materials,
≤20 morphs, ≤3 draw calls, char textures ≤2048px, VRAM ≤96MB, scene ≤300K tris / 80 calls)
**PASS**es on this build.

## 2. Load timeline (measured, local headless)

**Landing page** (`index.html` → interactive):

| Event | Measured |
|---|---|
| load event | 554 ms |
| first-paint | 172 ms |
| first-contentful-paint | 992 ms |
| `#root` rendered (interactive marker) | 1,046 ms |
| resources fetched | 2 (JS 1.38 MB in 91 ms, CSS 2.5 KB) |
| console errors | 0 |

JS download→parse→execute→React render gap: **≈820 ms on this VM's CPU**
(FCP 992 ms − first-paint 172 ms − 91 ms download). This is the main-bundle
parse cost; it shrinks with code-splitting (§6) and grows on slower devices.

**Scene path** (click PREVIEW (NO HEADSET) → 3D settled):

| Event | Measured |
|---|---|
| click → `<canvas>` appears | 11,894 ms |
| canvas → asset settle | 3,258 ms |
| **click → settled total** | **15,152 ms** |
| resources fetched | 10, **6.95 MB** total |
| console errors | 0 |
| FPS (5 s window) | 0.6 — **SwiftShader artifact, not a finding** |

Resource waterfall (start ms after click → duration → size → file):

| Start | Dur | Size | File |
|---|---|---|---|
| 56 ms | 72 ms | 1,384 KB | `assets/index-DN8P7Lku.js` (cached from landing) |
| 1,318 ms | 4,479 ms | 3,679 KB | `rooms/room-bake.glb` |
| 1,324 ms | 52 ms | 4 KB | `sprites/gary/manifest.json` |
| 1,326 ms | 50 ms | 4 KB | `sprites/marlow/manifest.json` |
| 1,374 ms | 93 ms | 982 KB | `pano/hq-meadow-360-seamless.jpg` |
| 7,922 ms | 33 ms | 315 KB | `sprites/gary/body.png` |
| 7,924 ms | 35 ms | 427 KB | `sprites/marlow/body.png` |
| 10,018 ms | 44 ms | 146 KB | `sprites/gary/mouth-atlas.png` |
| 10,020 ms | 42 ms | 169 KB | `sprites/marlow/mouth-atlas.png` |

Structural findings (real, not rig artifacts):
- **Sprite loads are serialized**: manifest → body.png (7.9 s) → mouth-atlas.png (10.0 s).
  Three sequential round-trips where one parallel batch would do.
- **GLB characters are not fetched on this path**: `hybrid/gary.glb` (2.61 MB) and
  `hybrid/marlow.glb` (1.36 MB) ship in dist but the scene uses sprites. Keep them
  (Worker E's character integration owns them) — do not delete, do not "optimize"
  by removing.
- The room GLB dominates: 3.68 MB, ~4.5 s of the local timeline just downloading.

## 3. Audio (measured)

- 71 files, **9.60 MB** total. All audio is **on-demand** — `famous.mp3` is not
  fetched during scene load (verified in waterfall). Good.
- `famous.mp3`: **5,070,102 B**, 192 kbps, 48 kHz stereo, **211.2 s**.
- **Decode cost** (`decodeAudioData`, headless VM): **4,637 ms** (run 1),
  **9,854 ms** (run 2) → report as **4.6–9.9 s range on this rig**; device
  measurement pending Quest probe. Either end of the range is a main-thread-adjacent
  stall risk on the GARY PERFORMS tap.
- **PCM footprint**: **71.1 MB** (measured from the decoded `AudioBuffer`:
  211.2 s × 44,100 Hz × 2 ch × 4 B). This transient allocation plausibly relates to
  the earlier 30 s UI stall observed when triggering the performance — correlation
  noted, not proven.
- Voice clips (e.g. `talk_m1.mp3` 137 KB / 8.5 s): decode ≈1.0–1.5 s on this rig,
  PCM ≈1.3–1.4 MB each. Small individually; fine on-demand.
- Reference re-encode (proposal data only, **not applied**): `famous.mp3` 192k →
  128k = **3.22 MB** (−33%).

## 4. Textures (measured)

| File | Px | PNG | WebP q80 | Saving |
|---|---|---|---|---|
| `room-baked-diffuse.png` | 2048×2048 | 2,257 KB | 136 KB | 93% |
| `room-baked-ao.png` | 2048×2048 | 222 KB | 24 KB | 89% |
| `sprites/marlow/body.png` | 512×1024 | 426 KB | 55 KB | 87% |
| `sprites/gary/body.png` | 683×1024 | 314 KB | 38 KB | 87% |
| `hybrid/atlas_marlow.png` | 1024×1024 | 375 KB | 42 KB | 88% |
| `hybrid/atlas_gary.png` | 1024×1024 | 361 KB | 73 KB | 79% |
| `hybrid/face_marlow_v1.png` | 390×430 | 280 KB | 29 KB | 89% |
| `hybrid/face_gary_v1.png` | 387×540 | 189 KB | 21 KB | 88% |
| `sprites/marlow/mouth-atlas.png` | 2048×1024 | 168 KB | 44 KB | 73% |
| `sprites/gary/mouth-atlas.png` | 2048×1024 | 145 KB | 40 KB | 72% |
| **10 PNGs total** | | **4,737 KB** | **502 KB** | **≈89%** |
| `pano/hq-meadow-360-seamless.jpg` | 2240×1120 | 1,005 KB | 112 KB (WebP q4) | 89% |

Variants are in `scripts/perf-out/` — **proposals only, never overwrote source art**.
WebP q90 variants also generated for visual-QC comparison.

Spec-compliance note (measured fact): the pano is **2240×1120 px**;
`360-SCALE-RULES.md` requires **3840×1920 minimum** for 360 backdrops. Re-export
at spec resolution (size will grow — pair with WebP).

## 5. Top 3 measured bottlenecks

1. **`famous.mp3` interaction stall** — 4.84 MB transfer + 4.6–9.9 s decode +
   71 MB transient PCM, all triggered by one tap (GARY PERFORMS). Biggest
   single interaction-latency risk in the measured app; correlated (not proven)
   with the earlier 30 s stall on that button.
2. **Click→scene-interactive 15.2 s** (local) — dominated by the 3.6 MB room GLB
   download plus the serialized sprite chain (manifest → body → mouth-atlas spans
   ~8.7 s locally) plus ~820 ms main-bundle parse. Absolute time is rig-inflated;
   the serialization and the GLB weight are structural.
3. **Texture transfer weight** — 4.7 MB of PNGs → 0.5 MB as WebP q80 (measured
   89% saving, variants ready for QC). Pure transfer win, zero behavior change.

## 6. Prioritized fix list (before → after, risk)

| # | Fix | Before → After (measured basis) | Risk | Owner to apply |
|---|---|---|---|---|
| 1 | WebP texture variants (q80; q90 for hero) + visual QC | 4.7 MB → 0.5 MB transfer for the 10 measured PNGs | **Low-Med** — QC the baked diffuse for banding at q80; keep PNG fallback for any that fail QC | Worker A (file swap in `public/`, rebuild) |
| 2 | Parallelize sprite fetch (body + mouth-atlas concurrently after manifest) | sprite chain ~8.7 s span → ~slowest-single-asset | **Low** — loader change only, no behavior change | Worker A/E |
| 3 | `famous.mp3`: keep on-demand, eliminate decode stall — stream via `<audio>` element instead of `decodeAudioData`, and/or 128k re-encode (4.84 → 3.22 MB measured) | 4.6–9.9 s decode + 71 MB PCM → ~0 decode, progressive start | **Med** — audio path change; needs listening QC | Worker A |
| 4 | Preload hint for `room-bake.glb` after landing renders (`<link rel="preload" as="fetch">`) | GLB fetch starts 1,318 ms after click → starts during landing idle | **Low** — HTML only | Worker A |
| 5 | `manualChunks` vendor split (three / R3F / XR / react / ratk vs app code) | every deploy re-downloads 393 KB gzip → app edits don't invalidate the vendor chunk (content-hash stable) | **Low** — `vite.config.js` only | Worker A |
| 6 | Pano re-export at 3840×1920 per 360-SCALE-RULES + WebP | 2240×1120 (below spec) → spec-compliant at ~112–200 KB WebP (est. from measured q4/q6 ratios) | **Low** — art task | art pipeline |
| 7 | Gated dev chunks (~6 MB): keep as-is (correctly gated, 0 runtime cost) | deploy stays 31 MB | **None** | — decision recorded |

Explicitly **not** proposed: deleting the unused-on-this-path GLBs (Worker E owns
them), touching `src/engine|interaction|director|characters`, preloading `famous.mp3`.

## 7. Audio preload strategy (notes, no changes applied)

- Current state is already correct: everything on-demand, nothing audio in the
  scene waterfall. Do not "fix" this.
- Voice clips (~100–137 KB): fetch-on-first-use is fine. Optional: idle-prefetch
  the greeting set after scene settle (proposal, unmeasured benefit).
- `famous.mp3`: **never preload**. Fix the decode path (fix #3) instead of the
  transfer path.

## 8. Code-split recommendations (proposals, not applied)

- `vite.config.js` → `build.rollupOptions.output.manualChunks`: one `vendor` chunk
  for `three`, `@react-three/fiber`, `@react-three/xr`, `react`, `react-dom`,
  `ratk`; everything else in app chunks. Rationale: three.js dominates the
  1.42 MB main bundle; vendor code changes rarely, app code changes often —
  content hashing then caches vendor across deploys. Expected effect: repeat-visit
  download drops to app-chunk-only. (Standard practice; exact post-split sizes
  require a build — left to Worker A.)
- The `emulate` dynamic import is already a correct split; keep the pattern.
- No route-level splitting to do (single-page app).

## 9. Not measured — pending Quest

FPS, frame time (avg/p95), draw calls, triangles, texture VRAM, JS heap, and
interaction latency **on device**, plus XR session overhead. Harness is ready:

- Probe: `scripts/perf-probe/quest-perf-probe.js` (verified headless:
  `node scripts/perf-verify-probe.mjs` → **PASS** — records frames, taps, marks,
  exports JSON to panel + `localStorage` + download)
- Runbook: `docs/QUEST-PERF-RUNBOOK.md` (what Amy taps, what it records, where
  numbers land)
- Integration (for Worker A — 3 lines, not applied by Worker C):
  copy probe to `src/perf/quest-perf-probe.js`, add
  `import './perf/quest-perf-probe.js'` in `src/main.jsx`. Dormant unless URL has
  `?perf=1&capture=N`.
- Measured Quest numbers get appended to this file and fill
  `tests/scene-budget.json`, which the build-time gate then enforces.

## 10. Scripts inventory (all Worker C owned, all read-only probes)

- `scripts/perf-measure-load.mjs` — landing load: nav/paint timings, interactive marker
- `scripts/perf-measure-scene.mjs` — PREVIEW click → canvas → settle, full waterfall, FPS sample
- `scripts/perf-measure-audio.mjs` — audio weights + `decodeAudioData` cost + re-encode reference
- `scripts/perf-verify-probe.mjs` — headless functional check of the Quest probe → PASS
- `scripts/perf-probe/quest-perf-probe.js` — the in-headset capture probe (drop-in)
- `scripts/perf-out/` — recompressed texture variants (proposals only, never source)

## 11. FIX 1 verification — GARY PERFORMS audio path (2026-10-03, measured)

**Finding: the "stream via `<audio>`" fix is ALREADY the production path. No code change was made.**

- `src/audio/voice.js` `performFamous()` (the `♪ GARY PERFORMS "FAMOUS" ♪` button path via
  `src/ui/Overlay.jsx`) uses HTML5 Audio streaming as its primary method
  (`new Audio()` → `preload='auto'` → `load()` → `play()` in the tap gesture).
  No `decodeAudioData` exists in `src/` at all; `THREE.AudioLoader` (which decodes)
  is used only for small voice clips and as an unreachable fallback (`playTrack`
  Method 3, only if `new Audio()` throws synchronously).
- Instrumented tap probe (headless Chromium, fresh `npm run build` dist,
  `decodeAudioData` wrapped, `HTMLAudioElement.play` wrapped, rAF gap monitor):
  - tap → `play()` call: **25 ms** (no UI stall at tap)
  - tap → `playing` event (audible): **6,445 ms** (progressive fetch of 4.9 MB on local server)
  - `decodeAudioData` calls during the tap window: **zero for famous.mp3**
    (2 calls observed were ~90 KB / ~80 KB voice clips from scene dialogue)
  - rAF gaps up to ~1.3 s in the 12 s post-tap window are consistent with
    SwiftShader software rendering of the 3D scene, not audio (no 5 MB decode occurred).
- The audit's 4.6–9.9 s / 71 MB PCM numbers were the file's *intrinsic* decode cost
  measured in isolation (`scripts/perf-measure-audio.mjs`), not the app's tap behavior.
  The earlier 30 s screenshot timeout on the FAMOUS button was a Playwright harness
  artifact (same symptom occurred on non-audio flows), not an audio decode stall.
- **Before/after:** before = streaming already; after = unchanged. Tap-to-`play()` 25 ms
  both ways. No before/after delta exists because no change was warranted
  (rule: no speculative optimization).
- **Genuine remaining lever (proposal, NOT applied):** 128k re-encode
  (4.84 MB → 3.22 MB measured, −33%) would cut tap-to-audible proportionally, but it
  changes shipped audio quality — Amy's call, parked in the parking lot, not applied here.
- Acceptance: not re-run for this fix (zero src changes; last 18/18 PASS stands at
  checkpoint `known-good-20261003-1`).

## 12. FIX 2 status — sprite-chain parallelization: NOT APPLIED (out of write scope)

**The serialized chain is confirmed in code** — `src/characters/BillboardCharacter.jsx`
lines 51–55:
```js
const man   = await (await fetch(`./sprites/${id}/manifest.json`)).json()
const body  = await load(`./sprites/${id}/${man.body.file}`)        // waits for manifest
const atlas = await load(`./sprites/${id}/${man.mouthAtlas.file}`)  // waits for body
```
The manifest fetch must stay first (URLs come from it), but `body` and `atlas`
are independent — `Promise.all([load(bodyUrl), load(atlasUrl)])` after the manifest
would collapse three round-trips toward one. Audit-measured span: ~8.7 s locally
(serialized); expected after: ~slowest-single-asset.

**Why not applied:** the loader lives in `src/characters/`, which is outside this
worker's write scope (`src/audio/` + asset-loading paths only). Per the task's
stop rule, the change is reported, not made.

**Exact proposed diff (for Worker A / parent — 3 lines, loader-only, no behavior change):**
```js
const man = await (await fetch(`./sprites/${id}/manifest.json`)).json()
const [body, atlas] = await Promise.all([
  load(`./sprites/${id}/${man.body.file}`),
  load(`./sprites/${id}/${man.mouthAtlas.file}`),
])
```
Risk: Low — texture objects are independent; `setAssets({ man, body, atlas })`
consumes them together afterward. Still requires: build → 18/18 acceptance →
checkpoint after applying.

## 13. FIX 3 — WebP visual QC (2026-10-03, branch `webp-visual-qc`)

**Production textures were NOT replaced.** All work is on branch `webp-visual-qc`;
`main` still ships the PNGs. Comparisons in `docs/webp-qc/`.

| Texture | PNG → WebP q80 | PSNR | Mean Δ/255 | Visual verdict |
|---|---|---|---|---|
| room-baked-diffuse (hero, 2048²) | 2,312 KB → 140 KB (−94%) | 39.2 dB | 1.11 | **PASS** — identical at full frame; 3× zoom on highest-contrast dot rows shows no banding/blocking |
| room-baked-diffuse q90 | 2,312 KB → 234 KB (−90%) | 42.8 dB | 0.71 | PASS (kept as hero option; q80 already clean) |
| room-baked-ao (2048²) | 228 KB → 25 KB (−89%) | 53.7 dB | 0.08 | **PASS** — numerically identical |
| atlas_marlow / atlas_gary | −89% / −80% | 31.8 / 30.5 dB | ~1.5 | PASS (numeric; same cartoon-art profile as faces) |
| face_marlow_v1 / face_gary_v1 (RGBA) | −90% / −89% | 20.3 / 18.7 dB | ~6.5 | **PASS (perceptual)** — alpha channel bit-identical (Δ=0); RGB Δ is sub-visible noise on flat cartoon art; side-by-side indistinguishable |
| mouth-atlas (both) | −76% | 21.8 dB | 3.66 | PASS (same profile) |
| sprites/gary/body.png | −88% | 25.7 dB | 2.21 | PASS |

**Variant-set defect found:** `scripts/perf-out/body.webp` (683×1024) is **Gary's** body,
not Marlow's — `public/sprites/marlow/body.png` (512×1024) has **no WebP variant**.
Any production swap must generate the Marlow variant first; the audit's "10 PNGs"
table overcounts by treating one file as both.

**Honest impact statement:** WebP saves **transfer bytes only** (4.7 MB → 0.5 MB
measured). Decoded RGBA bitmaps are dimension-identical, so **GPU VRAM is unchanged**
— this does NOT relieve the 95.6/96 MB VRAM cap. The win is load time over real
networks (time saved ≈ bytes saved ÷ bandwidth) and deploy weight. No VRAM relief.

**Decision for parent/Amy:** q80 passes visual QC on all checked textures; q90
available for the hero diffuse. Production swap (including generating the missing
Marlow body variant) is a one-command file replacement + rebuild + 18/18 acceptance,
but per the task it happens **only after explicit approval** — not applied here.
