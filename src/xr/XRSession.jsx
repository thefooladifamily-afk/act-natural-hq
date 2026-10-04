// XRSession — wraps the scene in @react-three/xr's <XR>, and owns the
// session lifecycle: mode tracking, hard rules, input listeners.
//
// HARD RULES (from v3):
// - speechSynthesis NEVER runs while presenting: on sessionstart the voice
//   engine is stopped cold and `presenting=true` forces captions-only.
// - Tap / trigger / pinch ALWAYS activates the gaze target (v3 dead-tap bug):
//   session-level `selectstart` -> activate hq.gaze.current.
// - On sessionend the meadow is restored for the next entry.
import { useEffect } from 'react'
import { XR, XROrigin } from '@react-three/xr'
import { xrStore } from './store.js'
import { activate } from '../interaction/UnifiedInput.js'
import { hq } from '../hq.js'

function onSessionStart(session) {
  const mode = session.mode || 'immersive-vr'
  hq.session.mode = mode === 'immersive-ar' ? 'ar' : 'vr'
  hq.session.presenting = true
  // Hard rule: kill any desktop TTS dead — it must never leak into the headset.
  hq.voice.presenting = true
  hq.voice.stop()
  hq.voice.resume()
  hq.ambience.resume()
  // MR: restore the persistent "last night's pick" anchor + start hit testing.
  if (hq.session.mode === 'ar' && hq.ratk) {
    hq.ratk.restoreAnchors().catch(() => {})
    hq.ratk.viewerHitTarget().catch(() => {})
  }
}

function onSessionEnd() {
  hq.session.mode = null
  hq.session.presenting = false
  hq.voice.presenting = false
  hq.voice.stop()
  hq.gaze.current = null
}

function onSelectStart(session) {
  // Pinch flash: hand cursors confirm the pinch for ~180ms.
  hq.hands = hq.hands || {}
  try { hq.hands.pinchedUntil = performance.now() + 180 } catch (e) {}
  // Haptics (controllers): a short pulse confirms the pinch/tap/trigger.
  // Hands have no actuators — the gaze reticle + focus glow is their feedback.
  try {
    for (const src of session.inputSources || []) {
      const acts = src.gamepad && src.gamepad.hapticActuators
      if (acts && acts.length && acts[0].pulse) {
        acts[0].pulse(0.6, 40).catch(() => {})
      }
    }
  } catch (e) { /* haptics unavailable — visual feedback still applies */ }
  // v3 dead-tap rule: pinch/tap/trigger activates whatever the gaze holds —
  // through the unified funnel (spatial blip + error surfacing).
  activate(hq.gaze.current, 'pinch')
}

export default function XRSession({ children }) {
  useEffect(() => {
    const offStart = xrStore.subscribe((s) => {
      const session = s.session
      if (session && !session._hqWired) {
        session._hqWired = true
        onSessionStart(session)
        session.addEventListener('end', function hqEnd() {
          session.removeEventListener('end', hqEnd)
          session._hqWired = false
          onSessionEnd()
        })
        // Bind the session: the raw event only carries one inputSource.
        session.addEventListener('selectstart', () => onSelectStart(session))
      }
    })
    return () => offStart()
  }, [])

  return <XR store={xrStore}><XROrigin position={[0, 0, 2.5]} />{children}</XR>
}
