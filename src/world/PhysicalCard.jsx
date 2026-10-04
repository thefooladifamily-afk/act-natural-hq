// PhysicalCard — Meta-native magic, item 3: the visitor's words as a CARD
// in the room's space, not a HUD. During the recut beat Marlow "holds up"
// a cue card with the visitor's exact words. Depth and presence — an
// object in the screening room, readable at 2m.
//
// One plane, one CanvasTexture (+1 draw call, inside the 80 budget).
// Driven by the Director: hq.physicalCard.show(words) / .hide().
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { canvasTexture } from './materials.js'
import { hq } from '../hq.js'

// Raised (held up, facing the seat) vs lowered (at her side, hidden).
// Marlow stands at (2.3, 0, -0.7) — the card stays in her hand's reach,
// angled toward the visitor. (Updated 2026-10-03 with the theater blocking.)
const RAISED = { pos: [1.95, 1.78, -0.45], rot: [-0.08, -0.38, 0] }
const LOWERED = { pos: [2.12, 1.12, -0.55], rot: [0.5, -0.38, 0.1] }

function drawCard(canvas, words) {
  const g = canvas.getContext('2d')
  const w = canvas.width, h = canvas.height
  // Cream cue card.
  g.fillStyle = '#f2e8d0'; g.fillRect(0, 0, w, h)
  g.strokeStyle = '#8a6f4d'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16)
  g.fillStyle = '#8a6f4d'; g.textAlign = 'center'
  g.font = 'bold 22px sans-serif'
  g.fillText("MARLOW'S NOTES", w / 2, 44)
  g.strokeStyle = '#c9b586'; g.lineWidth = 2
  g.beginPath(); g.moveTo(40, 60); g.lineTo(w - 40, 60); g.stroke()
  // The visitor's words, wrapped — shrink to fit, never clip.
  const text = '\u201c' + words + '\u201d'
  let cardSize = 30
  let lines = []
  const wrapCard = () => {
    g.font = `bold ${cardSize}px sans-serif`
    lines = []
    let line = ''
    for (const wd of text.split(' ')) {
      const test = line ? line + ' ' + wd : wd
      if (g.measureText(test).width > w - 80 && line) { lines.push(line); line = wd }
      else line = test
    }
    if (line) lines.push(line)
  }
  wrapCard()
  while (lines.length > 6 && cardSize > 18) { cardSize -= 2; wrapCard() }
  if (lines.length > 6) lines = [...lines.slice(0, 5), lines[5].slice(0, 40) + '\u2026']
  g.fillStyle = '#2a2118'
  const lh = cardSize + 10
  let y = 110 + Math.max(0, (4 - lines.length) * lh) / 2
  for (const ln of lines) { g.fillText(ln, w / 2, y); y += lh }
  g.fillStyle = '#8a6f4d'; g.font = 'italic 20px sans-serif'
  g.fillText('— tonight’s film, re-cut around you', w / 2, h - 28)
}

export default function PhysicalCard() {
  const group = useRef()
  const texRef = useRef()
  const anim = useRef({ t: 1, showing: false }) // t: 0 lowered … 1 raised

  useEffect(() => {
    const tex = canvasTexture(512, 352, (g, w, h) => {
      g.fillStyle = '#f2e8d0'; g.fillRect(0, 0, w, h)
    })
    texRef.current = tex
    // Attach the texture to the card mesh (created by the time this runs).
    const mesh = group.current && group.current.children[0]
    if (mesh) { mesh.material.map = tex; mesh.material.needsUpdate = true }
    const api = {
      show(words) {
        if (texRef.current) { drawCard(texRef.current.image, words); texRef.current.needsUpdate = true }
        anim.current.showing = true
        if (group.current) group.current.visible = true
      },
      hide() { anim.current.showing = false },
    }
    hq.physicalCard = api
    return () => { if (hq.physicalCard === api) hq.physicalCard = null }
  }, [])

  useFrame((_, dt) => {
    const a = anim.current
    if (!group.current) return
    const target = a.showing ? 1 : 0
    a.t += (target - a.t) * Math.min(1, dt * 3.5)
    if (Math.abs(target - a.t) < 0.002) {
      a.t = target
      if (!a.showing && group.current.visible) group.current.visible = false
    }
    const t = a.t
    const p = group.current.position
    p.set(
      LOWERED.pos[0] + (RAISED.pos[0] - LOWERED.pos[0]) * t,
      LOWERED.pos[1] + (RAISED.pos[1] - LOWERED.pos[1]) * t,
      LOWERED.pos[2] + (RAISED.pos[2] - LOWERED.pos[2]) * t,
    )
    const r = group.current.rotation
    r.set(
      LOWERED.rot[0] + (RAISED.rot[0] - LOWERED.rot[0]) * t,
      LOWERED.rot[1] + (RAISED.rot[1] - LOWERED.rot[1]) * t,
      LOWERED.rot[2] + (RAISED.rot[2] - LOWERED.rot[2]) * t,
    )
  })

  return (
    <group ref={group} visible={false} position={LOWERED.pos}>
      <mesh>
        <planeGeometry args={[0.8, 0.55]} />
        <meshBasicMaterial transparent toneMapped={false} />
      </mesh>
    </group>
  )
}

// Re-exported so the Director's recut-test can assert the card API exists.
export function cardApi() { return hq.physicalCard }
