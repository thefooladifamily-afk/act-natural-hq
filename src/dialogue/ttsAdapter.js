// ttsAdapter.js — one speak() interface, two backends.
//
//   TTS.speak({ text, speaker, rate, pitch, onBoundary }) -> Promise<void>
//     onBoundary(charIndex) fires while speaking (drives viseme timing).
//
// BACKENDS
// - 'webspeech' (TODAY's pipeline-validation stub): the browser's built-in
//   SpeechSynthesis. Desktop only — it REJECTS while an XR session is
//   presenting (hard rule: speechSynthesis never runs in-headset). In XR the
//   VoiceEngine falls back to captions-only and the procedural talk cycle.
// - 'elevenlabs' (DROP-IN, documented below): streams MP3 from the key-holding
//   PROXY (keys never live in this page — see voice-loop-design.md). Replace
//   the body of ElevenLabsTTS.speak() with the fetch below and set
//   TTS.backend = 'elevenlabs'. No other code changes.
//
// Voice IDs (Amy-approved, eleven_v3):
// - Marlow: May — aLthRrSon26HG0XSNBQ1
// - Gary:  TBD — no ElevenLabs voice approved for Gary. Fanz
//   (hYjzO0gkYN6FIXTHyEpi) is the closest existing approved voice but it was
//   locked for a different character; Amy picks Gary's voice.
export const VOICE_IDS = {
  marlow: 'aLthRrSon26HG0XSNBQ1', // May (locked 2026-09-28)
  gary: 'nPczCjzI2devNBz1zQrb',   // Brian (picked by Amy 2026-10-02, candidate 3)
}

export const TTS = {
  backend: 'webspeech',

  speak(opts) {
    if (this.backend === 'elevenlabs') return ElevenLabsTTS.speak(opts)
    return WebSpeechTTS.speak(opts)
  },
}

export const WebSpeechTTS = {
  speak({ text, speaker, rate, pitch, volume, onBoundary }) {
    return new Promise((resolve) => {
      const done = () => { try { window.speechSynthesis.cancel() } catch (e) {} ; resolve() }
      try {
        if (!('speechSynthesis' in window)) return resolve()
        const u = new SpeechSynthesisUtterance(text)
        // Greybox voice split: Gary higher + faster, Marlow lower + slower.
        // Real voices land with the ElevenLabs backend.
        if (speaker === 'gary') { u.rate = rate || 1.06; u.pitch = pitch || 1.15 }
        else { u.rate = rate || 0.94; u.pitch = pitch || 0.9 }
        if (volume !== undefined) u.volume = Math.max(0, Math.min(1, volume))
        if (onBoundary) u.onboundary = (e) => { try { onBoundary(e.charIndex || 0) } catch (err) {} }
        u.onend = done
        u.onerror = done
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(u)
        setTimeout(done, Math.max(5000, text.split(' ').length * 800)) // watchdog
      } catch (e) { resolve() }
    })
  },
}

// >>>>>>>>>>>>>>>>>>>>>> ELEVENLABS DROP-IN >>>>>>>>>>>>>>>>>>>>>>
// To enable: set TTS.backend = 'elevenlabs' and give the app PROXY_URL
// (the key-holding worker from voice-loop-design.md — Amy's approval needed
// before any new infra exists). Expected proxy contract:
//   POST {proxy}/tts  { voiceId, text, model_id:'eleven_v3' }
//   -> 200 audio/mpeg (streamed chunks fine — the player below starts on
//      first chunk so comedy timing is preserved).
// The returned player MUST call onBoundary(charIndex) as audio plays so the
// viseme driver keeps working — estimate from elapsed time if the proxy
// doesn't send word timings.
export const ElevenLabsTTS = {
  proxyUrl: null, // e.g. 'https://tts.<worker>.workers.dev'
  async speak({ text, speaker, rate, pitch, onBoundary }) {
    void rate; void pitch; void onBoundary
    if (!this.proxyUrl || !VOICE_IDS[speaker]) {
      // Not wired yet — caller (VoiceEngine) treats a rejection as
      // "backend unavailable" and falls back down the ladder.
      return Promise.reject(new Error('elevenlabs backend not wired: proxyUrl or voice id missing'))
    }
    // const res = await fetch(this.proxyUrl + '/tts', {
    //   method: 'POST', headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ voiceId: VOICE_IDS[speaker], text, model_id: 'eleven_v3' }),
    // })
    // ... stream res.body into an <audio> element / WebAudio buffer source,
    // ... estimate charIndex from elapsed audio time, call onBoundary(i),
    // ... resolve when playback ends.
    return Promise.reject(new Error('elevenlabs backend: proxy not deployed yet'))
  },
}
// <<<<<<<<<<<<<<<<<<<<<< ELEVENLABS DROP-IN <<<<<<<<<<<<<<<<<<<<<<
