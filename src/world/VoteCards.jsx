// VoteCards — "YOU pick tonight's stunt." Carried over from hq-v3.
//
// Three floating cards (swing / chimes / cats). Gaze 1.2s or tap/pinch to
// vote. The Director flips `hq.voteUI.visible`; cards read the flag in
// useFrame (no React re-renders). A vote calls Director.castVote().
// The winning stunt becomes a real reel in Amy's pipeline (continuity:
// localStorage 'screeningroom.v4').
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { canvasTexture } from './materials.js'
import { registerInteractive } from '../interaction/interactives.js'
import { useFocusGlow } from '../interaction/useFocusGlow.js'
import { REDUCED_MOTION } from '../util/reducedMotion.js'
import { useHQ } from '../hq-context.jsx'

const CARDS = [
  { id: 'swing', title: 'THE SWING SCENE', art: '🛝', desc: 'Gary launches off the rope swing. Physics has opinions.' },
  { id: 'chime', title: 'CHIME CHAOS', art: '🔔', desc: 'Marlow "tunes" the wind chimes. The meadow disagrees.' },
  { id: 'cats', title: 'CAT COUP', art: '🐈', desc: 'The ragdolls unionize. Demands are read aloud.' },
]

// 0.55m arc around the seated shoulder point [0, 1.0, 2.0]: ±25° of forward.
// (Viewer at z=2.5 via XROrigin; cards 0.7m ahead, within reach/gaze.)
const SEAT_POS = [0, 1.2, 2.5]
const CARD_POS = [-25, 0, 25].map((deg) => {
  const a = (deg * Math.PI) / 180
  return [0.55 * Math.sin(a), 1.08, 2.0 - 0.55 * Math.cos(a)]
})

function Card({ card, index }) {
  const hq = useHQ()
  const group = useRef()
  const mesh = useRef()

  const faceTex = useMemo(() => canvasTexture(512, 640, (g, w, h) => {
    g.fillStyle = '#f6efdd'; g.fillRect(0, 0, w, h)
    g.strokeStyle = '#2b2620'; g.lineWidth = 14; g.strokeRect(10, 10, w - 20, h - 20)
    g.textAlign = 'center'
    g.font = '120px serif'; g.fillText(card.art, w / 2, 210)
    g.fillStyle = '#2b2620'; g.font = 'bold 52px sans-serif'
    card.title.split(' ').forEach((wd, i) => g.fillText(wd, w / 2, 300 + i * 62))
    g.font = '34px sans-serif'; g.fillStyle = '#5a5348'
    const lines = card.desc.match(/.{1,26}(\s|$)/g) || []
    lines.forEach((line, i) => g.fillText(line.trim(), w / 2, 480 + i * 44))
  }), [card])

  const rec = useMemo(() => {
    const r = {
      id: `screeningRoom.vote.${card.id}`, kind: 'vote', object3D: null, radius: 0.38,
      onActivate: () => hq.director.castVote(card.id),
    }
    const unreg = registerInteractive(r)
    return { r, unreg }
  }, [card.id, hq])
  useEffect(() => () => rec.unreg(), [rec])
  useFocusGlow(rec, mesh)

  useFrame((state) => {
    if (!rec.r.object3D && mesh.current) rec.r.object3D = mesh.current
    if (!group.current) return
    const t = state.clock.elapsedTime
    // Reduced-motion: cards sit still; otherwise a gentle float.
    group.current.position.y = CARD_POS[index][1] + (REDUCED_MOTION ? 0 : Math.sin(t * 1.4 + index * 2.1) * 0.03)
    group.current.visible = !!hq.voteUI.visible
    group.current.lookAt(SEAT_POS)
  })

  return (
    // HANDS-FIRST: the three cards sit on a 0.55m arc around the seated
    // shoulder point [0,1.0,1.0] — every card inside the 0.6m reach volume,
    // each facing the seat. Gaze dwell or pinch/tap to vote.
    <group ref={group} position={CARD_POS[index]} visible={false} name={`screeningRoom.voteCard.${card.id}`}>
      {/* depth layer: a dark back-plate 3cm behind the face gives the card
          real parallax depth (Amy 20-feature #14) — 1 extra draw call each,
          only while voting. */}
      <mesh position={[0, 0, -0.03]}>
        <boxGeometry args={[0.5, 0.61, 0.02]} />
        <meshBasicMaterial color={0x0d1420} transparent opacity={0.92} />
      </mesh>
      <mesh ref={mesh} name={`screeningRoom.vote.${card.id}`}>
        <boxGeometry args={[0.44, 0.55, 0.04]} />
        <meshBasicMaterial map={faceTex} />
      </mesh>
    </group>
  )
}

export default function VoteCards() {
  const hq = useHQ()
  useEffect(() => {
    hq.voteUI.visible = false
    return () => { hq.voteUI.visible = false }
  }, [hq])
  return (
    <group name="screeningRoom.movieSelector">
      {CARDS.map((c, i) => <Card key={c.id} card={c} index={i} />)}
    </group>
  )
}
