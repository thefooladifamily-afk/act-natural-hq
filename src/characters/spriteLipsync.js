// spriteLipsync.js — 2D mouth-sprite driver. DROP-IN for LipSyncEngine.
//
// Same public surface the VoiceEngine uses (speakText / setCharIndex /
// stopText / attachAnalyser / detachAnalyser / setTalking / update), but
// instead of morph-target influences it outputs `currentMouth` — one of the
// 14 Character Animator mouth names exported from the PSDs:
//
//   Neutral, Ah, D, Ee, F, L, M, Oh, R, S, Uh, W-Oo, Smile, Surprised
//
// The BillboardCharacter component swaps the mouth-plane texture to
// `currentMouth` each frame. The 3D morph path (lipsync.js) is untouched —
// when the GLB sculpts land, the component swaps, not the pipeline.
import { textToVisemes } from '../dialogue/visemeMap.js'

// Oculus viseme -> Character Animator mouth. Standard CA mapping:
// sil=rest, PP/M (lips together), FF/F (teeth on lip), TH/DD/nn (tongue)
// ->D, kk->L, CH->D, SS->S, RR->R, aa->Ah, E/ih->Ee, oh->Oh, ou->W-Oo.
// Smile/Surprised are expression mouths (setExpression), never visemes.
export const OCULUS_TO_MOUTH = {
  sil: 'Neutral',
  PP: 'M',
  FF: 'F',
  TH: 'D',
  DD: 'D',
  kk: 'L',
  CH: 'D',
  SS: 'S',
  nn: 'D',
  RR: 'R',
  aa: 'Ah',
  E: 'Ee',
  ih: 'Ee',
  oh: 'Oh',
  ou: 'W-Oo',
}

export const MOUTH_NAMES = [
  'Neutral', 'Ah', 'D', 'Ee', 'F', 'L', 'M',
  'Oh', 'R', 'S', 'Uh', 'W-Oo', 'Smile', 'Surprised',
]

const CHARS_PER_SEC = 13

// Energy-driven mouth choice when audio (not text) drives the talk.
// Mirrors LipSyncEngine's analyser/cycle structure.
const CYCLE_SUBSET = ['Ah', 'Ee', 'Oh', 'W-Oo', 'M', 'D']

export class SpriteLipSync {
  constructor() {
    this.talking = false
    this.currentMouth = 'Neutral'
    this.energy = 0
    this.expression = null // 'Smile' | 'Surprised' | null — holds when idle
    this.analyser = null
    this._data = null
    this._t = 0
    this._cycle = 0
    this._textSeq = null
    this._textT = 0
    this._charIndex = -1
  }

  setExpression(name) {
    this.expression = MOUTH_NAMES.includes(name) ? name : null
    if (!this.talking) this.currentMouth = this.expression || 'Neutral'
  }

  speakText(text) {
    this._textSeq = textToVisemes(text)
    this._textT = 0
    this._charIndex = -1
    this.talking = true
  }
  setCharIndex(i) { this._charIndex = i }
  stopText() { this._textSeq = null; this._textT = 0; this._charIndex = -1 }

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
    this.energy = 0
    this.currentMouth = this.expression || 'Neutral'
  }

  setTalking(on) {
    this.talking = on
    if (!on) {
      this.stopText()
      this.energy = 0
      this.currentMouth = this.expression || 'Neutral'
    }
  }

  _driveText(dt) {
    if (!this._textSeq || !this._textSeq.length) return false
    this._textT += dt * CHARS_PER_SEC
    const idx = this._charIndex >= 0 ? this._charIndex : Math.floor(this._textT)
    if (idx >= this._textSeq.length) {
      this.stopText()
      this.energy = 0
      this.currentMouth = this.expression || 'Neutral'
      return true
    }
    const cur = this._textSeq[Math.min(idx, this._textSeq.length - 1)]
    this.currentMouth = OCULUS_TO_MOUTH[cur.viseme] || 'Neutral'
    this.energy = cur.jaw
    return true
  }

  update(dt) {
    if (!this.talking) {
      this.currentMouth = this.expression || 'Neutral'
      this.energy = 0
      return
    }
    this._t += dt
    if (this._driveText(dt)) return
    let energy = 0.35 + 0.3 * Math.sin(this._t * 13) * Math.sin(this._t * 7.3)
    if (this.analyser && this._data) {
      this.analyser.getByteFrequencyData(this._data)
      let sum = 0
      for (let i = 2; i < 24; i++) sum += this._data[i]
      energy = Math.min(1, (sum / 22 / 255) * 2.2)
    }
    this.energy = energy
    this._cycle += dt * (6 + energy * 10)
    if (energy < 0.18) {
      this.currentMouth = 'Neutral'
    } else {
      const pick = CYCLE_SUBSET[Math.floor(this._cycle) % CYCLE_SUBSET.length]
      this.currentMouth = pick
    }
  }
}
