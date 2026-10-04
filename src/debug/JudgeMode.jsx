// JudgeMode — the hidden technical overlay (Day 6-7 will make it cinematic;
// today it is minimal but REAL).
//
// Activation: type "judge" anywhere (not in a text field). What it shows is
// the ACTUAL runtime chain — USER ACTION -> EVENT -> MEMORY -> BEHAVIOR
// STATE -> DIRECTOR RULE -> CINEMATIC RESPONSE — read live from the event
// bus, session memory, and behavior engine. Triggering an interaction while
// it is open visibly propagates through the panel in real time. Nothing is
// simulated, no second fake representation: this is the same state the
// experience itself uses.
//
// Every number is measured: FPS from rAF deltas, events from the bus ring
// buffer, memory from SessionMemory, rules from DIRECTOR_RULE events.
import { useEffect, useRef, useState } from 'react'
import { hq } from '../hq.js'

const SEQ = 'judge'
const STREAM_SHOW = 12

function fmtTime(ts) {
  const d = new Date(ts)
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

function shortTarget(t) {
  if (!t) return '—'
  const p = String(t).split('.')
  return p[p.length - 1]
}

function streamLabel(e) {
  // The stream must name WHAT happened, not just the event type: a judge
  // watching live needs to see WHICH rule fired for their action and which
  // state it came from. Display-only — no engine behavior touched.
  if (e.type === 'DIRECTOR_RULE' && e.data && e.data.rule) return e.data.rule
  if (e.type === 'BEHAVIOR_STATE' && e.data && e.data.state) return e.data.state
  if (e.type === 'MEMORY_READ' && e.data && e.data.repeat) return shortTarget(e.target) + ' (repeat)'
  return shortTarget(e.target)
}

export default function JudgeMode() {
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(0) // re-render on bus events
  const buf = useRef('')
  const lastKey = useRef(0)
  const fps = useRef({ ema: 0, last: 0 })

  // Hidden activation: type "judge" (desktop), or ?judge=1 in the URL
  // (Quest: no keyboard on the headset — audit fix).
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || ''
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const now = performance.now()
      if (now - lastKey.current > 1500) buf.current = ''
      lastKey.current = now
      buf.current = (buf.current + (e.key || '').toLowerCase()).slice(-SEQ.length)
      if (buf.current === SEQ) {
        buf.current = ''
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    // Quest: ?judge=1 opens Judge Mode on load (no keyboard). Kept as an
    // alternative to the keydown sequence, not a replacement.
    let urlOpen = false
    try {
      urlOpen = new URLSearchParams(window.location.search).get('judge') === '1'
    } catch (e) { /* URL parsing is non-essential */ }
    if (urlOpen) setOpen(true)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Live bus subscription — the panel IS the event stream.
  useEffect(() => {
    if (!open || !hq.bus) return
    const off = hq.bus.on('*', () => setTick((t) => t + 1))
    return () => { try { off() } catch (e) {} }
  }, [open])

  // Measured FPS while open (rAF deltas — never faked).
  useEffect(() => {
    if (!open) return
    let raf = 0
    const loop = (t) => {
      const f = fps.current
      if (f.last) {
        const dt = t - f.last
        f.ema = f.ema ? f.ema * 0.9 + dt * 0.1 : dt
      }
      f.last = t
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [open])

  if (!open) return null

  const stream = hq.bus ? hq.bus.getStream().slice(-STREAM_SHOW).reverse() : []
  const mem = hq.memory ? hq.memory.summarize() : null
  const beh = hq.behavior ? hq.behavior.getState() : null
  const lastRule = hq.bus
    ? [...hq.bus.getStream()].reverse().find((e) => e.type === 'DIRECTOR_RULE')
    : null
  const lastEvent = hq.bus && hq.bus.getStream().length
    ? hq.bus.getStream()[hq.bus.getStream().length - 1]
    : null
  const fpsVal = fps.current.ema ? (1000 / fps.current.ema) : 0

  return (
    <div style={{
      position: 'fixed', top: 12, right: 12, width: 340, maxHeight: '86vh',
      overflowY: 'auto', zIndex: 60, pointerEvents: 'auto',
      background: 'rgba(8,12,18,0.92)', border: '1px solid rgba(120,180,255,0.25)',
      borderRadius: 10, padding: 12, color: '#cfe3ff',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11,
      lineHeight: 1.5, backdropFilter: 'blur(6px)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ letterSpacing: 2, fontSize: 12 }}>JUDGE MODE</strong>
        <button onClick={() => setOpen(false)} style={btn}>close</button>
      </div>

      <Section title="BEHAVIOR STATE">
        <KV k="state" v={beh && beh.state ? beh.state : '—'} hot />
        <KV k="reason" v={(beh && beh.reason) || '—'} />
      </Section>

      <Section title="LAST DIRECTOR RULE">
        <KV k="rule" v={(lastRule && lastRule.data.rule) || '—'} hot />
        <KV k="response" v={(lastRule && lastRule.data.response) || '—'} />
      </Section>

      <Section title="EVENT STREAM (live)">
        {stream.length === 0 && <div style={dim}>no events yet — interact</div>}
        {stream.map((e) => (
          <div key={e.seq} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={dim}>#{e.seq} {fmtTime(e.timestamp)}</span>{' '}
            <span style={{ color: typeColor(e.type) }}>{e.type}</span>{' '}
            <span>{streamLabel(e)}</span>{' '}
            <span style={dim}>[{e.source}]</span>
          </div>
        ))}
      </Section>

      <Section title="SESSION MEMORY">
        <KV k="events" v={mem ? mem.totalEvents : 0} />
        <KV k="by type" v={mem ? Object.entries(mem.byType).map(([k, v]) => `${k}:${v}`).join(' ') : '—'} />
        <KV k="top target" v={mem && mem.topTargets[0] ? `${shortTarget(mem.topTargets[0].target)} ×${mem.topTargets[0].interactions}` : '—'} />
        {lastEvent && lastEvent.data && lastEvent.data.memoryRead && (
          <KV k="last memory read" v={`visits ${lastEvent.data.memoryRead.priorVisits}, interacts ${lastEvent.data.memoryRead.priorInteractions}`} hot />
        )}
      </Section>

      <Section title="PERFORMANCE (measured)">
        <KV k="fps" v={fpsVal.toFixed(0)} />
        <KV k="frame" v={fps.current.ema ? fps.current.ema.toFixed(1) + ' ms' : '—'} />
        <KV k="input" v={(lastEvent && lastEvent.source) || '—'} />
      </Section>

      <div style={{ ...dim, marginTop: 6 }}>
        Pipeline: USER ACTION → EVENT → MEMORY → BEHAVIOR STATE → DIRECTOR RULE → RESPONSE.
        All values live. Type "judge" to close.
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 10, borderTop: '1px solid rgba(120,180,255,0.15)', paddingTop: 6 }}>
      <div style={{ ...dim, letterSpacing: 1.5, marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  )
}

function KV({ k, v, hot }) {
  return (
    <div>
      <span style={dim}>{k}: </span>
      <span style={hot ? { color: '#ffd166', fontWeight: 700 } : {}}>{String(v)}</span>
    </div>
  )
}

const dim = { opacity: 0.55 }
const btn = {
  background: 'none', border: '1px solid rgba(120,180,255,0.4)', color: '#cfe3ff',
  borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 11,
}

function typeColor(t) {
  if (t === 'DIRECTOR_RULE') return '#ff9de2'
  if (t === 'BEHAVIOR_STATE') return '#ffd166'
  if (t === 'MEMORY_READ') return '#9df2ff'
  if (t === 'INTERACT' || t === 'COMPLETE') return '#a8ffb0'
  return '#cfe3ff'
}
