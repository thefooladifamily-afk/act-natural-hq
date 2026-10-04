// VoiceEngine — dialogue audio. GREYBOX v5.
//
// HARD RULES (the v2 freeze post-mortem):
// - speechSynthesis NEVER runs while an XR session is presenting.
// - Per-line MP3s (./audio/<lineId>.mp3, cast voices) play as
//   THREE.PositionalAudio attached to the speaking character's head.
// - Missing file -> desktop TTS via the TTS adapter (Web Speech stub;
//   ElevenLabs drops in at the adapter) or captions-only in XR.
// - TTS->viseme: the adapter's onBoundary() callbacks (or a chars/sec
//   estimate) drive the speaker's Oculus viseme stream — the timing
//   validation path for the dialogue pipeline.
// - Watchdogs everywhere: a stuck line can never stall the show.
//
// React wiring: the engine is a singleton; the Director drives it.
// CaptionCard.jsx renders VoiceEngine.caption state (no React re-render in
// the hot path — the card texture is drawn imperatively like v3).
import * as THREE from 'three'
import { getAvatar } from '../characters/avatarRegistry.js'
import { TTS } from '../dialogue/ttsAdapter.js'

export const VOICE_DIR = './audio/'

export const VoiceEngine = {
  current: null,       // {kind:'file'|'tts', node}
  fileCache: {},       // lineId -> AudioBuffer (false when missing)
  trackCache: {},       // track url -> AudioBuffer: Famous decodes ONCE,
                        // every replay reuses the buffer (Task E: no
                        // per-play re-decode — decode hitches kill 72fps)
  onLineEnd: null,
  listener: null,
  audioLoader: null,
  presenting: false,   // set true while an XR session is presenting
  caption: { speaker: '', accent: '#fff', text: '', visible: false },
  _captionListeners: new Set(),

  init(camera) {
    if (!this.listener) {
      this.listener = new THREE.AudioListener()
      camera.add(this.listener)
      this.audioLoader = new THREE.AudioLoader()
    }
  },

  resume() {
    const ctx = this.listener && this.listener.context
    if (ctx && ctx.state === 'suspended') { try { ctx.resume() } catch (e) {} }
  },

  onCaption(fn) {
    this._captionListeners.add(fn)
    return () => this._captionListeners.delete(fn)
  },
  _emitCaption() {
    for (const fn of this._captionListeners) fn({ ...this.caption })
  },

  showCaption(speaker, accent, text) {
    this.caption = { speaker, accent, text, visible: true }
    this._emitCaption()
  },
  hideCaption() {
    if (this.caption.visible) {
      this.caption = { ...this.caption, visible: false }
      this._emitCaption()
    }
  },

  stop() {
    if (this.current) {
      try {
        if (this.current.kind === 'file' && this.current.node.isPlaying) this.current.node.stop()
        if (this.current.kind === 'tts') { try { window.speechSynthesis.cancel() } catch (e) {} }
      } catch (e) {}
      this.current = null
    }
    this.hideCaption()
  },

  /* Speak one dialogue line. line = {id?, speaker:'gary'|'marlow'|'you', text}. */
  speak(line) {
    this.stop()
    const isYou = line.speaker === 'you'
    const accent = line.speaker === 'gary' ? '#ffb347' : line.speaker === 'marlow' ? '#ff8fa3' : '#9fe8a9'
    this.showCaption(line.speaker.toUpperCase(), accent, line.text)
    if (isYou) return this._captionOnly(line) // the visitor's line: caption beat only
    const avatar = getAvatar(line.speaker)
    if (avatar) avatar.kick = 1 // talk bounce
    if (!line.id) return this._noFile(line, avatar) // dynamic responses: no file lookup
    this._tryFile(line, avatar)
  },

  _tryFile(line, avatar) {
    if (this.fileCache[line.id] === false) return this._noFile(line)
    if (this.fileCache[line.id]) return this._playFile(line, avatar, this.fileCache[line.id])
    this.audioLoader.load(VOICE_DIR + line.id + '.mp3',
      (buf) => { this.fileCache[line.id] = buf; this._playFile(line, avatar, buf) },
      undefined,
      () => { this.fileCache[line.id] = false; this._noFile(line) })
  },

  _noFile(line) {
    if (this.presenting) return this._captionOnly(line)
    return this._tryTTS(line)
  },

  _playFile(line, avatar, buf) {
    const s = new THREE.PositionalAudio(this.listener)
    s.setBuffer(buf); s.setRefDistance(1.6); s.setMaxDistance(16)
    // SPATIAL AUDIO HOOK: voice comes from the character's head.
    const anchor = (avatar && avatar.headAnchor) || (avatar && avatar.group)
    if (anchor) anchor.add(s); else return this._captionOnly(line)
    this.current = { kind: 'file', node: s }
    // LIP-SYNC HOOK: feed the analyser into the avatar's viseme driver,
    // AND drive the phoneme-accurate text viseme sequence (not just energy).
    if (avatar && avatar.lipsync) {
      avatar.lipsync.attachAnalyser(s)
      if (line.text) avatar.lipsync.speakText(line.text)
    }
    try { s.play() } catch (e) { this.current = null; return this._ended() }
    const src = s.source
    const done = () => {
      if (avatar && avatar.lipsync) avatar.lipsync.detachAnalyser()
      try { anchor.remove(s) } catch (e) {}
      if (this.current && this.current.node === s) { this.current = null; this._ended() }
    }
    if (src) src.onended = done
    else setTimeout(done, Math.max(1500, line.text.split(' ').length * 450))
    setTimeout(() => {
      if (this.current && this.current.node === s) {
        try { s.stop() } catch (e) {}
        done()
      }
    }, Math.max(6000, line.text.split(' ').length * 900))
  },

  /* META-NATIVE MAGIC (Task F): Marlow's whisper asides — conspiratorial,
     just-for-you lines delivered while the room is dimmed. May's voice
     (placeholder until Amy records the real ones), quieter + breathier.
     WebSpeech has no panner node, so "off-center intimacy" comes from low
     volume + timing (dimmed room, no other dialogue); when the ElevenLabs
     backend lands, route this through PositionalAudio with a slight pan
     offset for true positional whispers. */
  whisperAside(text, onEnd) {
    this.stop()
    this.showCaption('MARLOW · whisper', '#ff8fa3', text)
    const avatar = getAvatar('marlow')
    if (avatar) avatar.kick = 0.6
    // May's pre-rendered whisper MP3s (stand-in until Amy records). File wins
    // over TTS whenever it exists — same ladder as the main voice engine.
    const WHISPER_FILES = {
      "Psst — he's doing the thing again.": 'whisper_thing',
      "Don't tell him I told you, but he rehearsed that.": 'whisper_rehearsed',
      'See? This is why we film everything.': 'whisper_film',
    }
    const fileId = WHISPER_FILES[text]
    // MP3s play as positional audio even in XR (only WebSpeech TTS is banned
    // while presenting) — so the file path runs in-headset too.
    if (fileId && this.audioLoader && typeof window !== 'undefined') {
      this.audioLoader.load(VOICE_DIR + fileId + '.mp3',
        (buf) => {
          const s = new THREE.PositionalAudio(this.listener)
          s.setBuffer(buf); s.setRefDistance(1.2); s.setMaxDistance(10); s.setVolume(0.62) // hushed: close + quiet
          const anchor = (avatar && avatar.headAnchor) || (avatar && avatar.group)
          if (!anchor) { this._whisperTTS(text, onEnd, avatar); return } // no head to whisper from -> TTS ladder
          anchor.add(s)
          this.current = { kind: 'whisper-file', node: s }
          if (avatar && avatar.lipsync) {
            avatar.lipsync.attachAnalyser(s)
            avatar.lipsync.speakText(text)
          }
          const done = () => {
            if (avatar && avatar.lipsync) avatar.lipsync.detachAnalyser()
            try { anchor.remove(s) } catch (e) {}
            if (this.current && this.current.node === s) { this.current = null; if (onEnd) onEnd() }
          }
          try { s.play() } catch (e) { done(); return }
          if (s.source) s.source.onended = done
          setTimeout(done, Math.max(6000, text.split(' ').length * 900)) // watchdog: never stall
        },
        undefined,
        () => this._whisperTTS(text, onEnd, avatar), // missing file -> TTS ladder
      )
      return
    }
    this._whisperTTS(text, onEnd, avatar)
  },

  _whisperTTS(text, onEnd, avatar) {
    if (this.presenting || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      // XR / headless: caption beat only, never stall the show.
      setTimeout(() => { if (onEnd) onEnd() }, Math.max(1800, text.split(' ').length * 420))
      return
    }
    const lipsync = avatar && avatar.lipsync
    if (lipsync) lipsync.speakText(text)
    this.current = { kind: 'whisper', node: null }
    const my = this.current
    setTimeout(() => {
      if (this.current === my) {
        if (lipsync) { lipsync.stopText(); lipsync.setTalking(false) }
        this.current = null
        if (onEnd) onEnd()
      }
    }, Math.max(6000, text.split(' ').length * 900))
    TTS.speak({
      text, speaker: 'marlow',
      rate: 0.92, pitch: 0.85, volume: 0.55, // hushed: slower, lower, quieter
      onBoundary: (i) => { if (lipsync) lipsync.setCharIndex(i) },
    }).then(() => {
      if (lipsync) { lipsync.stopText(); lipsync.setTalking(false) }
      if (this.current === my) { this.current = null; if (onEnd) onEnd() }
    })
  },

  _tryTTS(line, avatar) {
    // HARD RULE: the TTS adapter never runs inside an XR session.
    if (this.presenting) return this._captionOnly(line)
    const lipsync = avatar && avatar.lipsync
    // TTS->viseme TIMING VALIDATION: start the text-driven viseme stream on
    // the speaker's mouth; boundary events refine the char position.
    if (lipsync) lipsync.speakText(line.text)
    this.current = { kind: 'tts', node: null }
    const my = this.current
    // Watchdog: a stuck TTS leg can never stall the show.
    setTimeout(() => {
      if (this.current === my) {
        if (lipsync) { lipsync.stopText(); lipsync.setTalking(false) }
        this.current = null
        this._ended()
      }
    }, Math.max(6000, line.text.split(' ').length * 900))
    TTS.speak({
      text: line.text,
      speaker: line.speaker,
      onBoundary: (i) => { if (lipsync) lipsync.setCharIndex(i) },
    }).then(() => {
      if (lipsync) { lipsync.stopText(); lipsync.setTalking(false) }
      if (this.current && this.current.kind === 'tts') { this.current = null; this._ended() }
    })
  },

  _captionOnly(line) {
    setTimeout(() => this._ended(), Math.max(2000, line.text.split(' ').length * 480))
  },

  _ended() { if (this.onLineEnd) { const f = this.onLineEnd; this.onLineEnd = null; f() } },

  /* Performance track: an arbitrary local audio file played through the
     SAME analyser-driven lip-sync path as dialogue (avatar.lipsync gets
     the analyser, jaw + visemes follow the real audio energy).
     Item: Gary performs "Famous" (public/audio/famous.mp3). */
  playTrack(url, speaker, captionText) {
    this.stop()
    const accent = speaker === 'gary' ? '#ffb347' : speaker === 'marlow' ? '#ff8fa3' : '#9fe8a9'
    this.showCaption((speaker || 'gary').toUpperCase(), accent, captionText || '♪ performing… ♪')
    const avatar = getAvatar(speaker)
    if (avatar) avatar.kick = 1 // talk bounce
    const line = { speaker, text: captionText || '♪' }
    if (this.trackCache[url]) return this._playFile(line, avatar, this.trackCache[url])
    this.audioLoader.load(url,
      (buf) => { this.trackCache[url] = buf; this._playFile(line, avatar, buf) },
      undefined,
      () => this._captionOnly({ text: '' }))
  },

  performFamous() {
    // HTML5 Audio for iOS. Preload on first call, play on gesture.
    // Multiple fallbacks: direct play, then blob URL, then Web Audio.
    const url = './audio/famous.mp3'
    const avatar = getAvatar('gary')
    if (avatar) avatar.kick = 1
    this.showCaption('GARY', '#ffb347', '♪ GARY performs "Famous" ♪')
    if (avatar && avatar.lipsync) avatar.lipsync.speakText('♪ GARY performs Famous ♪')

    const done = () => {
      if (avatar && avatar.lipsync) avatar.lipsync.detachAnalyser()
      this._ended()
    }

    // Method 1: direct HTML5 Audio
    try {
      const a = new Audio()
      a.preload = 'auto'
      a.src = url
      // iOS: load() then play() in the same gesture
      a.load()
      const p = a.play()
      if (p && p.catch) p.catch(() => {
        // Method 2: fetch as blob, play via object URL
        fetch(url).then(r => r.blob()).then(b => {
          const bUrl = URL.createObjectURL(b)
          const bAudio = new Audio(bUrl)
          bAudio.play().catch(() => this._captionOnly({ text: '' }))
          bAudio.onended = done
        }).catch(() => this._captionOnly({ text: '' }))
      })
      a.onended = done
      this._famousAudio = a
      return
    } catch (e) {}
    // Method 3: Web Audio fallback
    this.playTrack(url, 'gary', '♪ GARY performs "Famous" ♪')
  },
}
