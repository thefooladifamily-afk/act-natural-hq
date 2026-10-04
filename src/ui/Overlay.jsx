// DOM overlay: intro screen, HUD, endcard. (DOM only exists outside XR —
// in-headset UI is the in-world cards + caption card.)
//
// RETURN HOOK machinery lives here: the endcard captures the visitor's name
// (outside XR, where typing works); the intro greets returning visitors by
// name. Inside XR there is no typing — continuity only.
import { useState, useEffect } from 'react'
import { store } from '../state/store.js'
import { activate } from '../interaction/UnifiedInput.js'

export function Intro({ onEnter, err }) {
  const d = store.data
  const returning = d.visits > 0 && d.visitorName
  const [arSupported, setArSupported] = useState(null)
  const [vrSupported, setVrSupported] = useState(null)
  useEffect(() => {
    let dead = false
    if ('xr' in navigator && navigator.xr.isSessionSupported) {
      navigator.xr.isSessionSupported('immersive-ar').then(ok => { if (!dead) setArSupported(ok) }).catch(() => { if (!dead) setArSupported(false) })
      navigator.xr.isSessionSupported('immersive-vr').then(ok => { if (!dead) setVrSupported(ok) }).catch(() => { if (!dead) setVrSupported(false) })
    } else { setArSupported(false); setVrSupported(false) }
    return () => { dead = true }
  }, [])
  const secure = typeof window !== 'undefined' && window.isSecureContext
  return (
    <div className="hq-overlay">
      <h1>THE SCREENING ROOM</h1>
      <div className="sub">ACT NATURAL — a reality documentary.</div>
      {returning && (
        <div className="hint">Welcome back, <b>{d.visitorName}</b> — visit #{d.visits + 1}. They remember you.</div>
      )}
      <div className="hint">
        You're in Marlow's screening room — where she cuts her documentary about Gary,
        and Gary dreads going. <b>Look to aim, pinch to choose.</b> Pick tonight's
        stunt, then talk to Gary and Marlow — they answer out loud, and the room
        remembers what you picked.
      </div>
      <div className="hq-btnrow">
        <button className="hq-btn" onClick={() => onEnter('vr')} disabled={vrSupported === false} title={vrSupported === false ? 'VR not supported on this device/browser' : ''}>ENTER IN VR{vrSupported === false ? ' (NOT SUPPORTED)' : ''}</button>
        <button className="hq-btn secondary" onClick={() => onEnter('ar')} disabled={arSupported === false} title={arSupported === false ? 'Passthrough not supported on this device' : ''}>ENTER IN MIXED REALITY{arSupported === false ? ' (NOT SUPPORTED)' : ''}</button>
        <button className="hq-btn secondary" onClick={() => onEnter('flat')}>PREVIEW (NO HEADSET)</button>
      </div>
      {!secure && (
        <div className="hq-err">This page is not in a secure context (https) — WebXR sessions can't start. PREVIEW still works.</div>
      )}
      {vrSupported === false && (
        <div className="hint">This browser doesn't support immersive VR. On Quest, open this page in the Quest Browser. PREVIEW (NO HEADSET) runs the full show flat.</div>
      )}
      <div className="hint">
        Quest: open the <b>https://</b> address (<i>npm run dev:https</i>) — WebXR needs a secure context.
        Desktop: preview only, no headset session.
      </div>
      {err && <div className="hq-err">{err}</div>}
    </div>
  )
}

export function Hud() {
  const [, force] = useState(0)
  // Re-render whenever the store changes (votes, visits, name) — the vote
  // counter used to go stale because castVote() never triggered a render.
  useEffect(() => store.subscribe(() => force((n) => n + 1)), [])
  const d = store.data
  const votes = d.votes || {}
  const [line, setLine] = useState('')
  // ONE canonical pipeline: even HUD buttons go through the unified funnel
  // (INPUT -> EVENT -> MEMORY -> BEHAVIOR -> DIRECTOR -> RESPONSE), with
  // inline records for controls that have no 3D counterpart.
  function direct() {
    const hq = window.__hq
    if (!hq) return
    activate({ id: 'screeningRoom.directorConsole', kind: 'console', object3D: null,
      onActivate: () => { if (hq.director) hq.director.directLine(line) } }, 'keyboard')
    setLine('')
  }
  function famous() {
    const hq = window.__hq
    if (!hq) return
    activate({ id: 'screeningRoom.famousButton', kind: 'hud', object3D: null,
      onActivate: () => {
        if (hq.voice) {
          // iOS requires AudioContext resume on user gesture
          if (hq.voice.resume) hq.voice.resume()
          hq.voice.performFamous()
        }
      } }, 'mouse')
  }
  return (
    <div className="hq-hud">
      visit <b>#{d.visits + 1}</b>
      {d.visitorName && <> · <b>{d.visitorName}</b></>}
      {d.lastPick && <> · last pick <b>{d.lastPick}</b></>}
      <> · votes <b>{(votes.swing || 0) + (votes.chime || 0) + (votes.cats || 0)}</b></>
      {/* DIRECTOR MODE: type a line, Gary performs it live. */}
      <span style={{ marginLeft: 12 }}>
        <input
          value={line}
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') direct() }}
          placeholder="director: type a line for Gary…"
          maxLength={280}
          style={{ width: 220, marginRight: 6 }}
        />
        <button className="hq-btn secondary" onClick={direct} style={{ marginRight: 6 }}>GARY SAYS IT</button>
        <button className="hq-btn secondary" onClick={famous}>♪ GARY PERFORMS "FAMOUS"</button>
      </span>
    </div>
  )
}

export function EndCard({ info, onBack }) {
  const d = store.data
  const votes = d.votes || {}
  const [name, setName] = useState(d.visitorName || '')
  // P1 FINALE BRANCH: the endcard reflects the behavior-dependent branch.
  // The REAL response already happened (finale lighting + audio motif via
  // the director rule); this copy is supporting evidence naming the actual
  // session facts — never generic text substitution.
  const finale = info && info.finale
  const homecoming = finale && finale.branch === 'HOMECOMING'
  const homeTarget = homecoming && finale.facts.mostReturnedTarget
    ? String(finale.facts.mostReturnedTarget).split('.').pop().toUpperCase()
    : null

  function saveName() {
    const n = name.trim().slice(0, 24)
    if (n) { store.data.visitorName = n; store.save() }
    onBack()
  }

  return (
    <div className="hq-overlay hq-endcard">
      <h1>{homecoming ? 'THE ROOM REMEMBERS YOU' : "THAT'S THE SHOW"}</h1>
      {info && info.title && <div className="pick">TONIGHT'S STUNT: {info.title}</div>}
      {homecoming && homeTarget ? (
        <div className="sub">
          You kept coming back to {homeTarget} — {finale.facts.mostReturnedCount}x. The room noticed.
          EP013 — "The One Where Gary Talks to You."
        </div>
      ) : (
        <div className="sub">EP013 — "The One Where Gary Talks to You." Same screening room tomorrow — bring a vote.</div>
      )}
      <div className="hq-votes">
        <span>swing <b>{votes.swing || 0}</b></span>
        <span>chime <b>{votes.chime || 0}</b></span>
        <span>cats <b>{votes.cats || 0}</b></span>
      </div>
      <div className="hint">Tell us your name — they'll remember it next visit.</div>
      <div className="hq-btnrow">
        <input
          className="hq-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="your name"
          maxLength={24}
        />
        <button className="hq-btn" onClick={saveName}>REMEMBER ME</button>
      </div>
      <div className="hq-btnrow">
        <button className="hq-btn secondary" onClick={onBack}>BACK TO THE MEADOW</button>
      </div>
    </div>
  )
}
