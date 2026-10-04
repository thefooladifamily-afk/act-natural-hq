// Ambience — 100% procedural WebAudio (chimes + breeze + birds).
// Carried over verbatim from hq-v3. No audio files needed.
// Exposes a positional chime hook (SPATIAL) so the XR build can pin the
// chime source to the 3D wind-chime location instead of the stereo master.
export const Ambience = {
  ctx: null, master: null, started: false,
  wind: 0.5, nextChime: 0, nextBird: 0,
  // C major pentatonic, high and bell-like
  SCALE: [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5],

  start() {
    if (this.started) return
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.85
      this.master.connect(this.ctx.destination)
      this._breeze()
      this.started = true
    } catch (e) { /* audio unavailable — the meadow stays silent, the show goes on */ }
  },

  resume() { if (this.ctx && this.ctx.state === 'suspended') { try { this.ctx.resume() } catch (e) {} } },

  // UI BLIP (Amy 20-feature #9): a tiny spatial confirmation ping for
  // button/selection activations. `pan` is -1 (left) .. 1 (right), derived
  // from the activated object's world x. StereoPannerNode is used instead
  // of HRTF here: it's a UI cue, not a world sound, and it's ~10x cheaper.
  // Silent no-op when audio hasn't started (autoplay policy) — never throws.
  blip(pan = 0) {
    if (!this.started || !this.ctx) return
    try {
      const t = this.ctx.currentTime
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(660, t)
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.07)
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11)
      osc.connect(gain)
      if (panner) {
        panner.pan.value = Math.max(-1, Math.min(1, pan))
        gain.connect(panner); panner.connect(this.master)
      } else {
        gain.connect(this.master)
      }
      osc.start(t); osc.stop(t + 0.13)
    } catch (e) { /* UI cue is non-essential */ }
  },

  // SPATIAL HOOK: call once with a THREE.AudioListener + world position to
  // move the chime plucks into 3D space (PannerNode). Falls back to master.
  spatializeChimes(listener, position) {
    if (!this.started || this._spatial) return
    try {
      this._chimeBus = this.ctx.createGain()
      const panner = this.ctx.createPanner()
      panner.panningModel = 'HRTF'
      panner.distanceModel = 'inverse'
      panner.refDistance = 2
      panner.maxDistance = 30
      if (panner.positionX) {
        panner.positionX.value = position.x
        panner.positionY.value = position.y
        panner.positionZ.value = position.z
      } else {
        panner.setPosition(position.x, position.y, position.z)
      }
      this._chimeBus.connect(panner)
      panner.connect(this.master)
      this._spatial = true
    } catch (e) { /* keep stereo fallback */ }
  },

  _noiseBuffer() {
    const len = this.ctx.sampleRate * 3
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    return buf
  },

  _breeze() {
    const src = this.ctx.createBufferSource()
    src.buffer = this._noiseBuffer(); src.loop = true
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.4
    const g = this.ctx.createGain(); g.gain.value = 0.05
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.07
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.03
    lfo.connect(lfoG); lfoG.connect(g.gain)
    src.connect(lp); lp.connect(g); g.connect(this.master)
    src.start(); lfo.start()
  },

  pluck(freq, when, vol = 0.16) {
    if (!this.started) return
    const t0 = when
    const out = this._chimeBus || this.master
    for (const [mult, amp] of [[1, 1], [2.01, 0.28], [2.98, 0.12]]) {
      const o = this.ctx.createOscillator()
      o.type = 'sine'; o.frequency.value = freq * mult
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(vol * amp, t0 + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0004, t0 + 2.8)
      o.connect(g); g.connect(out)
      o.start(t0); o.stop(t0 + 3.0)
    }
  },

  chirp() {
    if (!this.started) return
    const t0 = this.ctx.currentTime + 0.05
    const n = 2 + ((Math.random() * 3) | 0)
    const base = 3200 + Math.random() * 1600
    for (let i = 0; i < n; i++) {
      const o = this.ctx.createOscillator()
      o.type = 'sine'
      const s = t0 + i * 0.16
      o.frequency.setValueAtTime(base * (1 + Math.random() * 0.1), s)
      o.frequency.exponentialRampToValueAtTime(base * 0.72, s + 0.12)
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(0, s)
      g.gain.linearRampToValueAtTime(0.028, s + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0004, s + 0.14)
      o.connect(g); g.connect(this.master)
      o.start(s); o.stop(s + 0.2)
    }
  },

  tick(t, chimeSway) {
    if (!this.started) return
    this.wind = 0.5 + 0.32 * Math.sin(t * 0.23) + 0.18 * Math.sin(t * 0.71 + 1.7)
    this.wind = Math.max(0.08, Math.min(1, this.wind))
    if (t >= this.nextChime) {
      this.pluck(this.SCALE[(Math.random() * this.SCALE.length) | 0], this.ctx.currentTime + 0.03)
      if (Math.random() < 0.35 * this.wind) {
        this.pluck(this.SCALE[(Math.random() * this.SCALE.length) | 0], this.ctx.currentTime + 0.35, 0.1)
      }
      this.nextChime = t + (5 + Math.random() * 9) / (0.4 + this.wind)
    }
    if (t >= this.nextBird) {
      this.chirp()
      this.nextBird = t + 9 + Math.random() * 16
    }
    if (chimeSway) chimeSway(this.wind, t)
  },
}
