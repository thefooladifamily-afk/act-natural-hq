// MobileTalkUI — HTML fallback for the talk stage on touch devices.
// The 3D talk console uses gaze (VR/desktop). On mobile flat mode, show
// HTML buttons for the suggested lines + WRAP IT UP. Buttons route through
// the UNIFIED funnel (activate(rec, 'touch')) — one canonical pipeline:
// INPUT -> EVENT -> MEMORY -> BEHAVIOR STATE -> DIRECTOR -> RESPONSE.
import { useEffect, useState } from 'react'
import { useHQ } from '../hq-context.jsx'
import { SUGGESTED_LINES } from '../dialogue/respond.js'
import { getInteractives } from '../interaction/interactives.js'
import { activate } from '../interaction/UnifiedInput.js'

function fire(id, fallback) {
  const rec = getInteractives().find((r) => r.id === id)
  if (rec) activate(rec, 'touch')
  else fallback()
}

export default function MobileTalkUI() {
  const hq = useHQ()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setInterval(() => {
      // Show only in flat mode (no XR) when talk is active
      const isFlat = !hq.session.presenting
      const shouldShow = isFlat && hq.talkUI && hq.talkUI.visible
      setVisible(!!shouldShow)
    }, 250)
    return () => clearInterval(t)
  }, [hq])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: 16, right: 16, zIndex: 20,
      display: 'flex', flexDirection: 'column', gap: 10,
      maxHeight: '60vh', overflowY: 'auto',
    }}>
      <div style={{ textAlign: 'center', color: '#8fd0ff', fontWeight: 700, marginBottom: 4 }}>
        TALK TO THEM — tap a line:
      </div>
      {SUGGESTED_LINES.map(line => (
        <button
          key={line.id}
          onClick={() => fire(`screeningRoom.talk.line.${line.id}`,
            () => { if (hq.director) hq.director.askLine(line) })}
          style={{
            padding: '14px', borderRadius: '12px',
            border: `2px solid ${line.target === 'gary' ? '#ffb347' : '#ff8fa3'}`,
            background: 'rgba(20,20,20,0.9)', color: '#fdf6e3',
            fontSize: '15px', fontWeight: 600, cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          {line.label}
        </button>
      ))}
      <button
        onClick={() => fire('screeningRoom.talk.wrap',
          () => { if (hq.director) hq.director.endTalk() })}
        style={{
          padding: '14px', borderRadius: '12px', border: '2px solid #9fe8a9',
          background: 'rgba(20,20,20,0.9)', color: '#9fe8a9',
          fontSize: '16px', fontWeight: 700, cursor: 'pointer',
        }}
      >
        WRAP IT UP →
      </button>
    </div>
  )
}
