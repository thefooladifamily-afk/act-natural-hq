# Polish Integration Note (Worker D → Core Worker)

Additive presets only. **No existing file has been modified.** The core worker wires these in; Worker D owns the preset files and will not touch the wiring.

## What was added

| Preset | File | Plugs into | One-line wiring |
|---|---|---|---|
| `warmWelcome` | `src/world/lighting-presets/index.js` | `RoomLights.jsx` via `hq.lights` (Director.start / showVote / startTalk) | `hq.lights.dimTo(1.0); hq.lights.setWarmth(0.3); hq.lights.setGlow(0)` |
| `cinemaHush` | `src/world/lighting-presets/index.js` | `RoomLights.jsx` via `hq.lights` (Director.playRecut / playStunt) | `hq.lights.dimTo(0.32); hq.lights.setWarmth(0.9); hq.lights.setGlow(0.75)` |
| `finaleGlow` | `src/world/lighting-presets/index.js` | `RoomLights.jsx` via `hq.lights` (Director.endShow / exitShow) | `hq.lights.dimTo(0.88); hq.lights.setWarmth(0.55); hq.lights.setGlow(0.4)` |
| `lobby` ambience | `src/audio/presets/ambience.js` | `audio/ambience.js` live nodes | `Ambience.master.gain.setTargetAtTime(0.85, t, 0.5)` + breeze/chime/bird targets from the preset |
| `hush` ambience | `src/audio/presets/ambience.js` | `audio/ambience.js` live nodes | `Ambience.master.gain.setTargetAtTime(0.7, t, 0.33)` + sparse chime targets |
| `celebration` ambience | `src/audio/presets/ambience.js` | `audio/ambience.js` live nodes | `Ambience.master.gain.setTargetAtTime(0.9, t, 0.8)` + dense chime targets |
| `choiceCommitted` | `src/audio/presets/stingers.js` | `audio/voice.js` trackCache path | decode `public/audio/whisper_thing.mp3` once via the existing famous.mp3 path; play at vol 0.5 with 80ms/600ms fades |
| `memoryRecall` | `src/audio/presets/stingers.js` | `audio/ambience.js` | `Ambience.pluck(880.0, t, 0.12); Ambience.pluck(1046.5, t + 0.32, 0.12)` — fires with `RULE_RETURN_ACK` / `RULE_REPEAT_ACK` in `engine/DirectorResponses.js` |
| `finaleRise` | `src/audio/presets/stingers.js` | `audio/voice.js` trackCache path | play `public/audio/famous.mp3` at vol 0.7, 2s fade-in — **reuse the cached buffer, never re-decode** (~4.9MB) |
| Mix snapshots | `src/audio/presets/mix.js` | `director/Director.js` beat methods | look up `MIX_SNAPSHOTS[beat]`: apply the ambience preset, fire the stinger, duck the master |
| `portalVote` | `src/world/transition-configs/index.js` | `PortalTransition.jsx` | replace `DURATION = 0.9` with the config value; params document the existing ring/card behavior |
| `fadeToBlack` | `src/world/transition-configs/index.js` | `director/Director.js` playHook | drive `hq.lights.dimTo` over 0.6s with `easeInOutQuad` |
| `recutDip` | `src/world/transition-configs/index.js` | `director/Director.js` playRecut | dip/recover `dimTo` curve over 1.4s `smoothstep`, then hand off to `cinemaHush` mood |
| `finaleDissolve` | `src/world/transition-configs/index.js` | `director/Director.js` endShow | rise to `finaleGlow` over 2.0s `smoothstep` alongside the `finaleRise` stinger |

## Grounding (verified in source before writing)

- Light rig: `LIGHT_BASE = {dir:1.35, hemi:0.55, amb:0.25}`; neutral `0xffe0b0` → warm `0xff9e5e`; glow spill `0xbfd9ff` at `[0,1.7,-0.9]`, intensity `glow*0.85`. RoomLights converges per-frame (k = dt·3) — presets just set targets, no pops.
- Ambience: procedural WebAudio; `master` gain 0.85 default, breeze gain 0.05 / LP 420Hz, chime `pluck()` vol 0.16 pentatonic, `blip()` vol 0.18. All targets exist as live fields — no new nodes needed.
- Audio files verified present in `public/audio/`: `whisper_thing.mp3`, `famous.mp3`, plus the full `watch/vote/stunt/talk/recut/hook/end` dialogue set.
- Director beats verified in `director/Director.js`: `start`, `showVote`, `castVote`, `playStunt`, `startTalk`, `askLine`, `endTalk`, `playRecut`, `playHook`, `endShow`, `exitShow`.
- Reduced motion: every transition config specifies `instant-cut` (matches `REDUCED_MOTION` handling already in PortalTransition).

## Design rule applied throughout

Communicate through the world (lighting, sound, motion, character attention). No flashing, no generic state notifications, no HUDs, no debug-looking effects. The memory-recognition chime is the only "notification" — two soft notes, never a panel.

## Merge checklist for the core worker

1. `import` the four preset modules where the beats fire (new imports only).
2. Add the three lighting one-liners to the matching Director beats.
3. Ramp ambience targets per `MIX_SNAPSHOTS`; stingers reuse existing playback paths only.
4. Swap `PortalTransition`'s `DURATION` constant for the config import.
5. Verify: enter → warm welcome light; vote → whisper + portal; recut → amber hush + chimes; finale → golden lift + Famous. If any wiring threatens the acceptance tests, cut the wiring, keep the tests.
