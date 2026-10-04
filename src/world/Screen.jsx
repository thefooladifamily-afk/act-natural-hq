// Screen — the pull-down projection screen for the WATCH stage.
//
// Greybox geometry at true scale: 2.6m x 1.46m (16:9), centered y=1.62,
// hanging at z=-1.35 in front of the window. From the seat (z=1.2, eye 1.2)
// the viewing distance is ~2.55m — comfortable for a screening.
// Rolls UP (out of the sightline) for the TALK stage and back down never;
// the meadow returns once the show is interactive.
//
// COMPOSITION LAYER (Task B): the screen surface is an @react-three/xr
// XRLayer (quad, mono). In a layers-capable XR session the runtime's
// compositor draws the screen — the app skips the screen draw in each eye
// pass (~25% GPU saving on the screen pass). Runtimes without layers get
// the automatic fallback mesh; ?nolayers=1 forces the mesh for debugging.
//
// SPEC CORRECTION (Quest, verified 2026-10-02): XRQuadLayer width/height
// are HALF-EXTENTS on Quest — width:1 renders 2m wide. @pmndrs/xr's
// applyXRLayerScale halves the mesh scale for the layer, so the mesh keeps
// the FULL intended scale (2.6 x 1.46) and the layer lands at true size.
// Verify against the intended size on-device before calling it done.
//
// The texture is a canvas: hq.screen.card({ kicker, title, body }) swaps
// slides imperatively (no React re-render). Director drives the slide show.
// The layer blits from the same canvas texture (screenLayerBlit.js).
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { XRLayer } from '@react-three/xr'
import { canvasTexture } from './materials.js'
import { blitScreenToLayer } from '../xr/screenLayerBlit.js'
import { useHQ } from '../hq-context.jsx'

const NO_LAYERS = true
// Disabled 2026-10-02: XRLayer was not rendering on Quest (screen invisible).
// Mesh fallback is guaranteed. Re-enable layers only after on-device verification.

function wrapLines(g, text, maxWidth) {
  const words = (text || '').split(' ')
  const lines = []
  let line = ''
  for (const wd of words) {
    const t = line ? line + ' ' + wd : wd
    if (g.measureText(t).width > maxWidth && line) { lines.push(line); line = wd }
    else line = t
  }
  if (line) lines.push(line)
  return lines
}

function drawSlide(g, w, h, slide) {
  // Cinematic title treatment (Art Deco theater, not slide deck): warm black,
  // double gold rule, gold kicker, cream title with a hairline flourish.
  g.fillStyle = '#0d0b09'; g.fillRect(0, 0, w, h)
  g.strokeStyle = '#c9a227'; g.lineWidth = 4; g.strokeRect(14, 14, w - 28, h - 28)
  g.strokeStyle = '#8a6d1f'; g.lineWidth = 1; g.strokeRect(26, 26, w - 52, h - 52)
  g.textAlign = 'center'
  g.fillStyle = '#c9a227'; g.font = 'bold 36px sans-serif'
  g.fillText(slide.kicker || '', w / 2, 104)
  // Title: wrap, then shrink the font until it fits 2 lines — never clip mid-word.
  let titleSize = 68
  let titleLines = []
  while (titleSize >= 38) {
    g.font = `bold ${titleSize}px sans-serif`
    titleLines = wrapLines(g, slide.title, w - 140)
    if (titleLines.length <= 2) break
    titleSize -= 6
  }
  if (titleLines.length > 2) {
    // Still too long at the floor: hard-truncate the second line with an ellipsis.
    titleLines = [titleLines[0], titleLines[1].slice(0, 42) + '…']
  }
  g.fillStyle = '#f5ecd7'
  titleLines.slice(0, 2).forEach((ln, i) => g.fillText(ln, w / 2, 228 + i * 78))
  // hairline flourish under the title
  const ty = 228 + (Math.min(titleLines.length, 2) - 1) * 78 + 34
  g.strokeStyle = '#8a6d1f'; g.lineWidth = 2
  g.beginPath(); g.moveTo(w / 2 - 120, ty); g.lineTo(w / 2 + 120, ty); g.stroke()
  g.fillStyle = '#c9a227'
  g.beginPath(); g.arc(w / 2, ty, 5, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#cfc3a8'; g.font = '36px sans-serif'
  const bodyLines = wrapLines(g, slide.body, w - 140)
  bodyLines.slice(0, 2).forEach((ln, i) => g.fillText(ln, w / 2, h - 90 - (bodyLines.length > 1 ? 22 : 0) + i * 44))
}

export default function Screen() {
  const hq = useHQ()
  const group = useRef()
  const roll = useRef(0) // 0 = down (watching), 1 = up (talk)

  const tex = useMemo(() => canvasTexture(1024, 576, (g, w, h) => {
    drawSlide(g, w, h, { kicker: 'ACT NATURAL', title: 'TONIGHT\'S SCREENING', body: 'a reality documentary' })
  }), [])

  useEffect(() => {
    hq.screen = {
      texture: tex, // the composition layer blits from this (Task B)
      card(slide) {
        const t = tex
        const c = t.image
        drawSlide(c.getContext('2d'), c.width, c.height, slide)
        t.needsUpdate = true
      },
      rollDown() { roll.current = 0 },
      rollUp() { roll.current = 1 },
    }
    return () => { hq.screen = null }
  }, [hq, tex])

  useFrame((state, dt) => {
    if (!group.current) return
    // roll target: down = y 1.62, up = y 3.4 (above the sightline)
    const target = roll.current === 1 ? 3.4 : 1.62
    const g = group.current
    g.position.y += (target - g.position.y) * Math.min(1, dt * 2.5)
    void state
  })

  // z=-1.47: 5cm proud of the loft's ScreenBacking (-1.52); in the fallback
  // wood room it floats just in front of the window wall.
  return (
    <group ref={group} position={[0, 1.62, -1.47]} name="screeningRoom.mainScreen">
      {/* roller bar */}
      <mesh position={[0, 0.83, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 2.76, 12]} />
        <meshBasicMaterial color={0x2a2d33} />
      </mesh>
      {/* screen surface: composition layer in XR, mesh fallback otherwise.
          Full intended scale here (2.6 x 1.46m) — the layer halves it
          internally for Quest's half-extent convention. */}
      {NO_LAYERS ? (
        <mesh>
          <planeGeometry args={[2.6, 1.46]} />
          <meshBasicMaterial map={tex} />
        </mesh>
      ) : (
        <XRLayer
          shape="quad"
          layout="mono"
          pixelWidth={1024}
          pixelHeight={576}
          scale={[2.6, 1.46, 1]}
          customRender={(_target, state) => blitScreenToLayer(state)}
        />
      )}
      {/* pull bar */}
      <mesh position={[0, -0.78, 0]}>
        <boxGeometry args={[2.6, 0.05, 0.05]} />
        <meshBasicMaterial color={0x2a2d33} />
      </mesh>
    </group>
  )
}
