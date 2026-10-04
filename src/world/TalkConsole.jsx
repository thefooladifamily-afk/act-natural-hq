// TalkConsole — the dialogue stage UI. "TALK TO THEM."
//
// A floating panel with the suggested lines (tap/gaze a line -> the
// character answers in character, out loud, with viseme-driven mouth).
// Plus "WRAP IT UP" to end the talk stage.
//
// HANDS-FIRST GEOMETRY (seated, no controllers):
// - Panel center [0, 1.02, 0.65] — inside the 0.6m reach sphere centered at
//   the seated shoulder point [0, 1.0, 1.0].
// - Touch targets 0.44m x 0.20m (>> 0.18m minimum), 0.06m gutters.
// - Faces the seat (rotation y = PI). Directly forward — inside the
//   comfortable FoV cone.
// - Activation: gaze dwell 1.2s OR pinch/tap (session selectstart) on the
//   gaze target — same as every other control in the loop.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { canvasTexture } from './materials.js'
import { registerInteractive } from '../interaction/interactives.js'
import { useFocusGlow } from '../interaction/useFocusGlow.js'
import { REDUCED_MOTION } from '../util/reducedMotion.js'
import { SUGGESTED_LINES } from '../dialogue/respond.js'
import { useHQ } from '../hq-context.jsx'

function cardTexture(label, accent) {
  return canvasTexture(512, 224, (g, w, h) => {
    g.fillStyle = '#141821'; g.fillRect(0, 0, w, h)
    g.strokeStyle = accent; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16)
    g.textAlign = 'center'; g.fillStyle = '#fdf6e3'; g.font = 'bold 44px sans-serif'
    const words = label.split(' ')
    const lines = []
    let line = ''
    for (const wd of words) {
      const t = line ? line + ' ' + wd : wd
      if (g.measureText(t).width > w - 80 && line) { lines.push(line); line = wd }
      else line = t
    }
    if (line) lines.push(line)
    lines.slice(0, 3).forEach((ln, i) => g.fillText(ln, w / 2, 92 + i * 52))
  })
}

function LineCard({ line, col, row, accent }) {
  const hq = useHQ()
  const mesh = useRef()
  const tex = useMemo(() => cardTexture(line.label, accent), [line, accent])

  const rec = useMemo(() => {
    const r = {
      id: `screeningRoom.talk.line.${line.id}`, kind: 'talk', object3D: null, radius: 0.32,
      onActivate: () => { if (hq.director) hq.director.askLine(line) },
    }
    const unreg = registerInteractive(r)
    return { r, unreg }
  }, [line, hq])
  useEffect(() => () => rec.unreg(), [rec])
  useFocusGlow(rec, mesh)

  useFrame(() => {
    if (!rec.r.object3D && mesh.current) rec.r.object3D = mesh.current
  })

  return (
    <mesh ref={mesh} position={[-0.25 + col * 0.5, 0.13 - row * 0.26, 0.01]} name={`screeningRoom.talk.line.${line.id}`}>
      <boxGeometry args={[0.44, 0.2, 0.02]} />
      <meshBasicMaterial map={tex} />
    </mesh>
  )
}

function WrapButton() {
  const hq = useHQ()
  const mesh = useRef()
  const tex = useMemo(() => cardTexture('WRAP IT UP →', '#9fe8a9'), [])

  const rec = useMemo(() => {
    const r = {
      id: 'screeningRoom.talk.wrap', kind: 'talk', object3D: null, radius: 0.35,
      onActivate: () => { if (hq.director) hq.director.endTalk() },
    }
    const unreg = registerInteractive(r)
    return { r, unreg }
  }, [hq])
  useEffect(() => () => rec.unreg(), [rec])
  useFocusGlow(rec, mesh)

  useFrame(() => {
    if (!rec.r.object3D && mesh.current) rec.r.object3D = mesh.current
  })

  return (
    <mesh ref={mesh} position={[0, -0.28, 0.01]} name="screeningRoom.talk.wrap">
      <boxGeometry args={[0.5, 0.18, 0.02]} />
      <meshBasicMaterial map={tex} />
    </mesh>
  )
}

export default function TalkConsole() {
  const hq = useHQ()
  const group = useRef()

  useEffect(() => {
    hq.talkUI = { visible: false }
    return () => { hq.talkUI = null }
  }, [hq])

  useFrame((state) => {
    if (!group.current || !hq.talkUI) return
    group.current.visible = !!hq.talkUI.visible
    // always face the seated visitor
    const t = state.clock.elapsedTime
    group.current.position.y = 1.02 + (REDUCED_MOTION ? 0 : Math.sin(t * 1.2) * 0.015)
  })

  return (
    // +z faces the seated visitor at z=1.2 — no rotation needed.
    <group ref={group} position={[0, 1.02, 1.85]} visible={false} name="screeningRoom.talkConsole">
      {/* header */}
      <mesh position={[0, 0.32, 0]}>
        <planeGeometry args={[0.94, 0.12]} />
        <meshBasicMaterial color={0x0e1420} transparent opacity={0.85} />
      </mesh>
      {SUGGESTED_LINES.map((line, i) => (
        <LineCard
          key={line.id}
          line={line}
          col={i % 2}
          row={Math.floor(i / 2)}
          accent={line.target === 'gary' ? '#ffb347' : '#ff8fa3'}
        />
      ))}
      <WrapButton />
    </group>
  )
}
