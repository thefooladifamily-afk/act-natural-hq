// LipSyncEngine — morph-target viseme driver with a GLB upgrade path.
//
// PLACEHOLDER CONTRACT (do not invent final character art):
// - v4 ships abstract placeholder avatars: capsule body + sphere head.
// - The head carries morph targets named after the 15 Oculus visemes
//   (sil, PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, ih, oh, ou) + jawOpen.
//   These are the SAME names the Blender build exports as glTF morph
//   targets (QUEST-SPECS-AND-PERF-BUDGET.md: jaw as morph, not bone).
// - attachGLTF(url): when the real Gary/Marlow GLBs land, swap the
//   placeholder head for the GLB and this engine drives ITS morph targets
//   by name — no other code changes.
//
// Driving: VoiceEngine attaches a THREE.Audio analyser while a line plays;
// amplitude envelope -> jawOpen + pseudo-viseme cycling. When TTS speaks
// from text (Web Speech stub), speakText() maps the text to an Oculus
// viseme stream driven by boundary events (or a chars/sec estimate) —
// this is the TTS->viseme timing validation path. When no audio at all
// (captions only), a procedural talk cycle runs so the mouth still moves.
import * as THREE from 'three'
import { VISEMES } from './visemes.js'
import { textToVisemes } from '../dialogue/visemeMap.js'

export { VISEMES }

// Estimated speech rate when the TTS backend gives no boundary timings.
const CHARS_PER_SEC = 13

export class LipSyncEngine {
  constructor(headMesh, morphNames) {
    this.head = headMesh
    this.names = morphNames || []
    this.analyser = null
    this._data = null
    this.talking = false
    this._t = 0
    this._cycle = 0
    // Text-driven viseme stream (TTS->viseme timing validation).
    this._textSeq = null
    this._textT = 0
    this._charIndex = -1 // set by TTS boundary events when available
    // Mouth plane: a simple plane at the mouth that opens with jawOpen.
    // Placeholder-only visual — the GLB swap leaves it behind.
    this.mouthPlane = null
  }

  attachMouthPlane(mesh) { this.mouthPlane = mesh }

  // Start a text-driven viseme stream. Call setCharIndex(i) from TTS
  // boundary events when the backend provides them; otherwise the stream
  // advances on a chars/sec estimate. stopText() ends it.
  speakText(text) {
    this._textSeq = textToVisemes(text)
    this._textT = 0
    this._charIndex = -1
    this.talking = true
  }
  setCharIndex(i) { this._charIndex = i }
  stopText() { this._textSeq = null; this._textT = 0; this._charIndex = -1 }

  // Build morph targets on a placeholder sphere head. Each viseme gets a
  // subtly different mouth-region deformation so the pipeline is real
  // end-to-end; the SHAPES are placeholders, the PLUMBING is not.
  static makePlaceholderHead(radius = 0.17) {
    const geo = new THREE.SphereGeometry(radius, 24, 18)
    const pos = geo.attributes.position
    const morphs = []
    const v = new THREE.Vector3()
    VISEMES.forEach((name, vi) => {
      const arr = new Float32Array(pos.count * 3)
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i)
        // mouth region: lower-front of the sphere
        const mouthness = Math.max(0, 1 - Math.hypot(v.x / (radius * 0.55), (v.y + radius * 0.35) / (radius * 0.4), (v.z - radius * 0.8) / (radius * 0.5)))
        let dx = 0, dy = 0, dz = 0
        if (name === 'jawOpen' || name === 'aa') { dy = -0.05 * mouthness }
        else if (name === 'ou' || name === 'oh') { dz = 0.03 * mouthness; dx = -v.x * 0.15 * mouthness }
        else if (name === 'E' || name === 'ih') { dx = v.x * 0.22 * mouthness }
        else if (name === 'PP' || name === 'FF') { dz = -0.02 * mouthness }
        else { dy = -0.02 * mouthness; dx = v.x * 0.08 * mouthness }
        // vary per viseme index so targets are distinguishable
        const k = 0.7 + 0.3 * Math.sin(vi * 1.7)
        arr[i * 3] = dx * k; arr[i * 3 + 1] = dy * k; arr[i * 3 + 2] = dz * k
      }
      morphs.push(new THREE.Float32BufferAttribute(arr, 3))
    })
    geo.morphAttributes.position = morphs
    geo.morphTargetsRelative = true
    const mesh = new THREE.Mesh(geo)
    mesh.morphTargetDictionary = {}
    VISEMES.forEach((n, i) => { mesh.morphTargetDictionary[n] = i })
    mesh.morphTargetInfluences = new Array(VISEMES.length).fill(0)
    return mesh
  }

  // GLB UPGRADE PATH: pass a loaded GLB scene; the engine finds the head
  // mesh whose morphTargetDictionary contains Oculus viseme names and
  // drives it from then on. Returns true when a viseme mesh was found.
  attachGLTF(gltfScene) {
    let found = null
    gltfScene.traverse((o) => {
      if (found || !o.isMesh || !o.morphTargetDictionary) return
      const names = Object.keys(o.morphTargetDictionary)
      const hits = VISEMES.filter((v) => names.includes(v)).length
      if (hits >= 8) found = o // majority of the viseme set present
    })
    if (found) { this.head = found; return true }
    return false
  }

  attachAnalyser(threeAudio) {
    try {
      const ctx = threeAudio.context
      this.analyser = ctx.createAnalyser()
      this.analyser.fftSize = 256
      threeAudio.getOutput().connect(this.analyser)
      this._data = new Uint8Array(this.analyser.frequencyBinCount)
      this.talking = true
    } catch (e) { this.talking = true } // procedural fallback
  }

  detachAnalyser() {
    this.talking = false
    this.analyser = null
    this.stopText()
    this._setAll(0)
    this._setMouthPlane(0)
  }

  setTalking(on) { this.talking = on; if (!on) { this.stopText(); this._setAll(0); this._setMouthPlane(0) } }

  _setMouthPlane(jaw) {
    if (this.mouthPlane) {
      const s = 0.15 + jaw * 0.85
      this.mouthPlane.scale.set(1, Math.max(0.08, s), 1)
    }
  }

  _driveText(dt) {
    if (!this._textSeq || !this._textSeq.length) return false
    this._textT += dt * CHARS_PER_SEC
    const idx = this._charIndex >= 0 ? this._charIndex : Math.floor(this._textT)
    if (idx >= this._textSeq.length) { this.stopText(); this._setAll(0); this._setMouthPlane(0); return true }
    const cur = this._textSeq[Math.min(idx, this._textSeq.length - 1)]
    const infl = this.head.morphTargetInfluences
    const dict = this.head.morphTargetDictionary || {}
    if (!infl || !dict) return true
    this._setAll(0)
    if (dict[cur.viseme] !== undefined) infl[dict[cur.viseme]] = 0.9
    if (dict.jawOpen !== undefined) infl[dict.jawOpen] = cur.jaw
    this._setMouthPlane(cur.jaw)
    return true
  }

  update(dt) {
    if (!this.talking || !this.head || !this.head.morphTargetInfluences) return
    this._t += dt
    if (this._driveText(dt)) return
    let energy = 0.35 + 0.3 * Math.sin(this._t * 13) * Math.sin(this._t * 7.3) // procedural fallback
    if (this.analyser && this._data) {
      this.analyser.getByteFrequencyData(this._data)
      let sum = 0
      for (let i = 2; i < 24; i++) sum += this._data[i]
      energy = Math.min(1, (sum / 22 / 255) * 2.2)
    }
    this._setAll(0)
    const infl = this.head.morphTargetInfluences
    const dict = this.head.morphTargetDictionary || {}
    // jaw follows energy; a viseme cycles for shape variety
    if (dict.jawOpen !== undefined) infl[dict.jawOpen] = energy
    this._setMouthPlane(energy)
    this._cycle += dt * (6 + energy * 10)
    const vis = ['aa', 'E', 'oh', 'ou', 'ih', 'SS'] // placeholder cycle subset
    const pick = vis[Math.floor(this._cycle) % vis.length]
    if (dict[pick] !== undefined) infl[dict[pick]] = energy * 0.8
  }

  _setAll(v) {
    const infl = this.head.morphTargetInfluences
    if (infl) for (let i = 0; i < infl.length; i++) infl[i] = v
  }
}
