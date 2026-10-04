// governor.js — the runtime perf governor. 72fps holds IN CODE, not in docs.
//
// Watches rolling frame time against the 13.8ms budget (72fps) and steps a
// degradation ladder automatically. Spec order
// (QUEST-SPECS-AND-PERF-BUDGET.md — the law):
//   L0 full quality
//   L1 shadow map 2048 -> 1024
//   L2 pixel ratio 1.5 -> 1.25
//   L3 pixel ratio 1.25 -> 1.0
//   L4 character tri count (LOD swap — SKIPPED if no LOD meshes exist;
//      the greybox billboards/hybrids ship no LODs, so this step logs the
//      skip and the ladder continues past it)
//   L5 kill real shadows -> blob shadows under the characters
//   L6 far plane 200 -> 60 + non-essential effects off
//
// Hysteresis (no thrashing): step DOWN after 60 consecutive frames over
// budget; step UP only after 600 consecutive frames under budget (with
// 1.3ms of headroom). Every step change is logged (console + log ring).
import { hq } from '../hq.js'

export const FRAME_BUDGET_MS = 13.8
const DOWN_AFTER = 60    // consecutive over-budget frames before stepping down
const UP_AFTER = 600     // consecutive under-budget frames before stepping up
const RECOVER_MS = 12.5  // headroom: only step up when EMA is below this

export const STEPS = [
  { id: 'full', name: 'FULL' },
  { id: 'shadow1024', name: 'SHADOW 1024' },
  { id: 'pixel125', name: 'PIXEL 1.25' },
  { id: 'pixel100', name: 'PIXEL 1.0' },
  { id: 'charlod', name: 'CHAR LOD' },
  { id: 'noshadow', name: 'BLOB SHADOW' },
  { id: 'farfx', name: 'FAR+FX CUT' },
]

const FULL_PIXEL = 1.5
const FULL_FAR = 400 // matches the Canvas camera far in App.jsx

function setShadowSize(dir, size) {
  if (!dir) return
  const sh = dir.shadow
  if (sh.mapSize.x === size && sh.mapSize.y === size) return
  sh.mapSize.set(size, size)
  if (sh.map) { sh.map.dispose(); sh.map = null } // force realloc at new size
}

export const governor = {
  level: 0,
  ema: 16.6,   // start pessimistic: first frames include shader compile
  over: 0,
  under: 0,
  log: [],     // ring buffer of step changes (cap 50)
  _ctx: null,  // { gl, camera, scene } — set by GovernorTick
  _fxHidden: false,

  init(ctx) { this._ctx = ctx },

  // dtMs MUST already be clamped by the frame loop (no spiral of death).
  update(dtMs) {
    this.ema += (dtMs - this.ema) * 0.05
    if (this.ema > FRAME_BUDGET_MS) { this.over++; this.under = 0 }
    else if (this.ema < RECOVER_MS) { this.under++; this.over = 0 }
    else { this.over = 0; this.under = 0 } // in the dead zone: hold

    if (this.over >= DOWN_AFTER && this.level < STEPS.length - 1) {
      this._step(this.level + 1, 'over budget')
      this.over = 0; this.under = 0
    } else if (this.under >= UP_AFTER && this.level > 0) {
      this._step(this.level - 1, 'recovered')
      this.over = 0; this.under = 0
    }
  },

  _step(n, why) {
    const from = STEPS[this.level].name
    this.level = n
    this._apply()
    const msg = `[governor] ${from} -> ${STEPS[n].name} (${why}, ema ${this.ema.toFixed(1)}ms)`
    this.log.push(msg)
    if (this.log.length > 50) this.log.shift()
    // eslint-disable-next-line no-console
    console.log(msg)
  },

  // Applies the FULL state for the current level (idempotent, cumulative).
  _apply() {
    const ctx = this._ctx
    const gl = ctx && ctx.gl
    const camera = ctx && ctx.camera
    const dir = hq.lights && hq.lights.dirLight ? hq.lights.dirLight() : null
    const L = this.level

    // L1: shadow map 2048 -> 1024
    setShadowSize(dir, L >= 1 ? 1024 : 2048)

    // L2/L3: pixel ratio step-down, relative to the device's own full-quality
    // baseline (captured once — never RAISE the ratio on a dpr=1 device, and
    // always restore the true baseline when stepping back up).
    if (gl) {
      if (this._basePixel == null) this._basePixel = Math.min(gl.getPixelRatio() || FULL_PIXEL, FULL_PIXEL)
      const base = this._basePixel
      gl.setPixelRatio(L >= 3 ? Math.min(base, 1.0) : L >= 2 ? Math.min(base, 1.25) : base)
    }

    // L4: character LOD swap — no LOD meshes ship in the greybox, so this
    // step is a documented skip. The ladder continues past it.
    if (L >= 4) {
      if (hq.lods && typeof hq.lods.swap === 'function') hq.lods.swap(true)
      else this._note('L4 CHAR LOD skipped: no LOD meshes registered')
    } else if (hq.lods && typeof hq.lods.swap === 'function') hq.lods.swap(false)

    // L5: kill the real shadow map, show blob shadows instead
    if (dir) dir.castShadow = L < 5
    if (gl) gl.shadowMap.autoUpdate = L < 6
    if (hq.blobs && typeof hq.blobs.setVisible === 'function') hq.blobs.setVisible(L >= 5)

    // L6: far plane in + non-essential effects off
    if (camera && camera.far !== undefined) {
      const far = L >= 6 ? 60 : FULL_FAR
      if (camera.far !== far) { camera.far = far; camera.updateProjectionMatrix() }
    }
    if (L >= 6 && !this._fxHidden) {
      this._fxHidden = true
      for (const o of hq.fx.list) o.visible = false
    } else if (L < 6 && this._fxHidden) {
      this._fxHidden = false
      for (const o of hq.fx.list) o.visible = true
    }
    if (gl && L >= 5) gl.shadowMap.needsUpdate = true
  },

  _note(msg) {
    const full = `[governor] note: ${msg}`
    if (this.log[this.log.length - 1] !== full) {
      this.log.push(full)
      if (this.log.length > 50) this.log.shift()
    }
  },

  getState() {
    return {
      level: this.level,
      name: STEPS[this.level].name,
      ms: this.ema,
      fps: 1000 / Math.max(1, this.ema),
    }
  },
}
