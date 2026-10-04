// MobileVoteUI — HTML fallback for voting on touch devices.
// The 3D vote cards use gaze (VR). On mobile flat mode, show HTML buttons.
// Buttons route through the UNIFIED funnel (activate(rec, 'touch')) — one
// interaction model, and the Behavioral Cinema Engine sees every vote.
import { useEffect, useState } from 'react'
import { useHQ } from '../hq-context.jsx'
import { getInteractives } from '../interaction/interactives.js'
import { activate } from '../interaction/UnifiedInput.js'

const CARDS = [
  { id: 'swing', title: 'THE SWING SCENE', desc: 'Gary launches off the rope swing.' },
  { id: 'chime', title: 'CHIME CHAOS', desc: 'Marlow "tunes" the wind chimes.' },
  { id: 'cats', title: 'CAT COUP', desc: 'The ragdolls unionize.' },
]

export default function MobileVoteUI() {
  const hq = useHQ()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setInterval(() => {
      // Show only in flat mode (no XR) when voting is active
      const isFlat = !hq.session.presenting
      const shouldShow = isFlat && hq.voteUI && hq.voteUI.visible
      setVisible(!!shouldShow)
    }, 250)
    return () => clearInterval(t)
  }, [hq])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: 16, right: 16, zIndex: 20,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ textAlign: 'center', color: '#ffd166', fontWeight: 700, marginBottom: 4 }}>
        YOU pick tonight's stunt:
      </div>
      {CARDS.map(c => (
        <button
          key={c.id}
          onClick={() => {
            const rec = getInteractives().find((r) => r.id === `screeningRoom.vote.${c.id}`)
            if (rec) activate(rec, 'touch')
            else if (hq.director) hq.director.castVote(c.id) // record not mounted yet
          }}
          style={{
            padding: '14px', borderRadius: '12px', border: '2px solid #ffd166',
            background: 'rgba(20,20,20,0.9)', color: '#fdf6e3',
            fontSize: '16px', fontWeight: 600, cursor: 'pointer',
          }}
        >
          {c.title}<br />
          <span style={{ fontSize: '13px', fontWeight: 400, opacity: 0.8 }}>{c.desc}</span>
        </button>
      ))}
    </div>
  )
}
