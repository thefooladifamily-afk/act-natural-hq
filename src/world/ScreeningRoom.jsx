// ScreeningRoom — Marlow's screening room, restyled 2026-10-03 to the
// Amy-approved Hollywood Art Deco theater direction (blueprint §17).
//
// Was: plain wood box + editing desk. Now: warm ivory architectural shell
// (walls/ceiling/window trim in cream, beams + floor in warm wood), the
// window dressed with gold Deco trim (in TheaterSet), an emerald rug, and
// the ACT NATURAL poster rehung on the right wall in a gold frame where
// the visitor can actually read it.
//
// The proscenium (Proscenium.jsx) and set dressing (TheaterSet.jsx) mount
// separately in App.jsx. The editing desk/monitor/film cans were removed:
// the vintage camera + projector tell the filmmaking story in the room's
// Old Hollywood register, and the desk's modern NLE setup fought it.
//
// Layout: x in [-3,3], z in [-1.6,3.2], wall height 3.0.
// Front wall (z=-1.6) is mostly WINDOW: opening x in [-2.3,2.3], y in [0.85,2.55].
// Perf: cream merged to 1 draw call, wood beams 1, floor/rug/glass/poster/
// frame 1 each = 6 total.
import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { canvasTexture } from './materials.js'

function box(w, h, d, x, y, z, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d)
  if (ry) g.rotateY(ry)
  g.translate(x, y, z)
  return g
}

function plankTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    // Rich warm wood — deeper and more luxurious than the old pale planks.
    g.fillStyle = '#6e4a24'; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 8; i++) {
      const y = (i / 8) * h
      g.fillStyle = i % 2 ? '#664022' : '#75522e'
      g.fillRect(0, y, w, h / 8 - 3)
      g.fillStyle = 'rgba(30,18,8,.6)'
      g.fillRect(0, y + h / 8 - 3, w, 3)
      g.strokeStyle = 'rgba(50,32,14,.3)'
      for (let k = 0; k < 6; k++) {
        g.beginPath()
        const gy = y + 8 + Math.random() * (h / 8 - 16)
        g.moveTo(0, gy)
        g.bezierCurveTo(w * 0.3, gy + 4, w * 0.6, gy - 4, w, gy)
        g.stroke()
      }
    }
  })
}

// Realistic emerald Deco wall — jewel-tone green with material depth:
// fine grain, soft mottling, vignette, and METALLIC gold inlay (gradient,
// not flat). Amy 2026-10-03: "realistic wall texture."
function decoWallTexture() {
  return canvasTexture(1024, 896, (g, w, h) => {
    // deep emerald base with vertical falloff (darker at the floor)
    const bg = g.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#146845'); bg.addColorStop(0.6, '#0f4f36'); bg.addColorStop(1, '#0a3527')
    g.fillStyle = bg; g.fillRect(0, 0, w, h)
    // soft mottling — large low-contrast blotches for plaster/velvet depth
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 40 + Math.random() * 120
      const m = g.createRadialGradient(x, y, 0, x, y, r)
      const lite = Math.random() > 0.5
      m.addColorStop(0, lite ? 'rgba(40,140,100,0.10)' : 'rgba(4,20,14,0.12)')
      m.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = m
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
    }
    // fine grain
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${Math.random() > 0.5 ? '200,255,230' : '0,10,8'},${Math.random() * 0.05})`
      g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5)
    }
    // metallic gold gradient for the inlay (dark bronze -> bright gold)
    const goldGrad = g.createLinearGradient(0, 0, 0, h)
    goldGrad.addColorStop(0, '#e8c860'); goldGrad.addColorStop(0.5, '#c9a227')
    goldGrad.addColorStop(1, '#8a6d1f')
    const goldSoft = 'rgba(201,162,39,0.6)'
    g.strokeStyle = goldGrad; g.fillStyle = goldGrad
    // top + bottom stepped Deco borders
    for (const yy of [30, h - 30]) {
      g.lineWidth = 2.5
      g.beginPath(); g.moveTo(0, yy); g.lineTo(w, yy); g.stroke()
      g.lineWidth = 1.2
      for (let x = 0; x < w; x += 36) g.strokeRect(x + 7, yy - 10, 22, 20)
    }
    // 4 bays with fans, chevrons, diamonds
    for (let b = 0; b < 4; b++) {
      const x0 = b * 256, cx = x0 + 128
      g.lineWidth = 2.5 // bay dividers: double hairline
      g.beginPath(); g.moveTo(x0 + 1, 48); g.lineTo(x0 + 1, h - 48); g.stroke()
      g.lineWidth = 1.2
      g.beginPath(); g.moveTo(x0 + 8, 48); g.lineTo(x0 + 8, h - 48); g.stroke()
      g.lineWidth = 2.5 // fan motif
      for (let i = -4; i <= 4; i++) {
        const a = -Math.PI / 2 + (i / 4) * 0.9
        g.beginPath(); g.moveTo(cx, 196)
        g.lineTo(cx + Math.cos(a) * 68, 196 + Math.sin(a) * 68); g.stroke()
      }
      g.beginPath(); g.arc(cx, 196, 68, Math.PI, 0); g.stroke()
      g.beginPath(); g.arc(cx, 196, 50, Math.PI, 0); g.stroke()
      g.lineWidth = 3.5 // nested chevrons
      for (let k = 0; k < 3; k++) {
        const yy = 420 + k * 54, ww = 96 - k * 20
        g.beginPath()
        g.moveTo(cx - ww, yy - 30); g.lineTo(cx, yy); g.lineTo(cx + ww, yy - 30)
        g.stroke()
      }
      g.save(); g.translate(cx, h - 152); g.rotate(Math.PI / 4) // diamond
      g.lineWidth = 2.5; g.strokeRect(-17, -17, 34, 34)
      g.fillStyle = goldSoft; g.fillRect(-8, -8, 16, 16); g.restore()
      g.fillStyle = goldGrad
    }
  })
}

// Jewel-tone emerald ceiling with gold coffer trim — Amy's direction
// 2026-10-03. No beams. Deep green + antique gold = the Deco jewel box.
// Gold ceiling starburst medallion — Amy 2026-10-03. Radiating Deco rays
// around the chandelier mount, painted gold on transparent.
function starburstTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    const cx = w / 2, cy = h / 2
    g.clearRect(0, 0, w, h)
    const gold = g.createLinearGradient(0, 0, w, h)
    gold.addColorStop(0, '#e8c860'); gold.addColorStop(0.5, '#c9a227'); gold.addColorStop(1, '#8a6d1f')
    g.strokeStyle = gold; g.fillStyle = gold
    // radiating rays: alternating long/short Deco sunburst
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2
      const len = i % 2 === 0 ? 240 : 170
      g.lineWidth = i % 2 === 0 ? 5 : 2.5
      g.beginPath()
      g.moveTo(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60)
      g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len)
      g.stroke()
    }
    // concentric rings
    for (const [r, lw] of [[60, 4], [120, 2], [245, 5]]) {
      g.lineWidth = lw
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke()
    }
    // center medallion
    g.beginPath(); g.arc(cx, cy, 42, 0, Math.PI * 2); g.fill()
  })
}

function cofferTexture() {
  const t = canvasTexture(512, 512, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, w, h)
    bg.addColorStop(0, '#1c7a54'); bg.addColorStop(1, '#0f4a34')
    g.fillStyle = bg; g.fillRect(0, 0, w, h)
    const sheen = g.createRadialGradient(256, 256, 40, 256, 256, 360)
    sheen.addColorStop(0, 'rgba(46,160,110,0.60)')
    sheen.addColorStop(1, 'rgba(10,50,38,0.45)')
    g.fillStyle = sheen; g.fillRect(0, 0, w, h)
    const gold = '#c9a227', goldDeep = '#8a6d1f'
    for (const [cx, cy] of [[128, 128], [384, 128], [128, 384], [384, 384]]) {
      for (const [s, lw, c] of [[104, 5, gold], [84, 2, goldDeep], [60, 3, gold]]) {
        g.strokeStyle = c; g.lineWidth = lw
        g.strokeRect(cx - s / 2, cy - s / 2, s, s)
      }
      g.save(); g.translate(cx, cy); g.rotate(Math.PI / 4)
      g.strokeStyle = gold; g.lineWidth = 2; g.strokeRect(-14, -14, 28, 28)
      g.fillStyle = gold; g.fillRect(-4, -4, 8, 8)
      g.restore()
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(3, 2.5)
  return t
}

// Emerald velvet rug with muted gold rings — the bright rings were toned
// down 2026-10-03: at glancing angles they glinted like a floor scratch.
function rugTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    const cx = w / 2, cy = h / 2
    // deep emerald velvet base with mottling
    const bg = g.createRadialGradient(cx, cy, 40, cx, cy, 256)
    bg.addColorStop(0, '#146845'); bg.addColorStop(0.7, '#0e4a3a'); bg.addColorStop(1, '#082a22')
    g.fillStyle = bg; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 800; i++) {
      g.fillStyle = `rgba(${Math.random() > 0.5 ? '40,140,100' : '4,20,14'},${Math.random() * 0.08})`
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2)
    }
    // metallic gold for the ornate border
    const gold = g.createLinearGradient(0, 0, w, h)
    gold.addColorStop(0, '#e8c860'); gold.addColorStop(0.5, '#c9a227'); gold.addColorStop(1, '#8a6d1f')
    g.strokeStyle = gold
    // outer + inner gold bands
    for (const [r, lw] of [[238, 6], [226, 2], [150, 3], [140, 1.5]]) {
      g.lineWidth = lw
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke()
    }
    // geometric Deco border: repeating diamonds between the bands
    g.lineWidth = 2.5
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      const x = cx + Math.cos(a) * 188, y = cy + Math.sin(a) * 188
      g.save(); g.translate(x, y); g.rotate(a + Math.PI / 4)
      g.strokeRect(-11, -11, 22, 22)
      g.restore()
    }
    // center medallion: layered diamonds + fan
    g.lineWidth = 3
    for (const s of [70, 52, 34]) {
      g.save(); g.translate(cx, cy); g.rotate(Math.PI / 4)
      g.strokeRect(-s / 1.4, -s / 1.4, s * 1.43, s * 1.43)
      g.restore()
    }
    g.lineWidth = 2
    for (let i = -3; i <= 3; i++) { // small fan at center
      const a = -Math.PI / 2 + (i / 3) * 0.7
      g.beginPath(); g.moveTo(cx, cy + 8)
      g.lineTo(cx + Math.cos(a) * 30, cy + 8 + Math.sin(a) * 30); g.stroke()
    }
  })
}

function posterTexture() {
  return canvasTexture(512, 340, (g, w, h) => {
    g.fillStyle = '#e8d9b0'; g.fillRect(0, 0, w, h)
    g.strokeStyle = '#2b2620'; g.lineWidth = 12; g.strokeRect(8, 8, w - 16, h - 16)
    g.textAlign = 'center'; g.fillStyle = '#2b2620'
    g.font = 'bold 72px sans-serif'
    g.fillText('ACT NATURAL', w / 2, 120)
    g.font = '30px sans-serif'
    g.fillText('a documentary by MARLOW', w / 2, 190)
    g.font = 'italic 24px sans-serif'; g.fillStyle = '#6a5a48'
    g.fillText('Gary had no say in this film.', w / 2, 250)
  })
}

export default function ScreeningRoom() {
  // Emerald architectural shell: walls, ceiling. Walls are 4.2m (raised
  // 2026-10-03 for the Hollywood-glam volume Amy approved) with realistic
  // emerald Deco inlay. Front wall (z=-1.6) is SOLID — no window, no arch,
  // no opening. The screen rolls up to reveal plain continuing wall.
  const wallGeo = useMemo(() => {
    const parts = []
    // front wall: one solid piece
    parts.push(box(6.0, 4.2, 0.15, 0, 2.1, -1.6))
    // back + side walls
    parts.push(box(6.15, 4.2, 0.15, 0, 2.1, 3.2))
    parts.push(box(0.15, 4.2, 4.95, -3, 2.1, 0.8))
    parts.push(box(0.15, 4.2, 4.95, 3, 2.1, 0.8))
    return mergeGeometries(parts)
  }, [])

  // Coffered ceiling — its own mesh so it can carry the coffer texture.
  const ceilGeo = useMemo(() => box(6.15, 0.12, 4.95, 0, 4.26, 0.8), [])

  const floorTex = useMemo(plankTexture, [])
  const rugTex = useMemo(rugTexture, [])
  const posterTex = useMemo(posterTexture, [])
  const wallTex = useMemo(decoWallTexture, [])
  const ceilTex = useMemo(cofferTexture, [])
  const starTex = useMemo(starburstTexture, [])

  return (
    // Room footprint is true scale (x ±3, z -1.6..3.2) — the 1.35x group
    // scale from the initial commit was removed 2026-10-03: it put the
    // room out of register with the screen, the meadow scatter exclusion,
    // and the approved theater layout.
    <group>
      {/* Deco inlay walls: one draw call */}
      <mesh geometry={wallGeo}>
        <meshLambertMaterial map={wallTex} />
      </mesh>
      {/* emerald jewel-tone ceiling, gold coffers, no beams. Gentle emissive
          so it glows deep green overhead instead of falling to black. */}
      <mesh geometry={ceilGeo}>
        <meshLambertMaterial map={ceilTex} emissive={0x1a6a48} emissiveIntensity={0.75} emissiveMap={ceilTex} />
      </mesh>
      {/* gold starburst medallion around the chandelier mount */}
      <mesh position={[0, 4.19, 0.9]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.2, 2.2]} />
        <meshBasicMaterial map={starTex} transparent={true} toneMapped={false} />
      </mesh>
      {/* wood floor (y=0.05: clears the meadow disc at y=0, no z-fight) */}
      <mesh position={[0, 0.05, 0.8]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[6.15, 4.95]} />
        <meshLambertMaterial map={floorTex} />
      </mesh>
      {/* emerald rug under the visitor */}
      <mesh position={[0, 0.062, 1.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.25, 28]} />
        <meshLambertMaterial map={rugTex} />
      </mesh>
      {/* poster rehung on the right wall in a gold frame — readable, uncut */}
      <group position={[2.86, 1.6, -0.5]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh position={[0, 0, -0.02]}>
          <boxGeometry args={[1.62, 1.12, 0.05]} />
          <meshLambertMaterial color={0xc9a227} emissive={0x6b4e12} emissiveIntensity={0.35} />
        </mesh>
        <mesh>
          <planeGeometry args={[1.5, 1.0]} />
          <meshLambertMaterial map={posterTex} />
        </mesh>
      </group>
    </group>
  )
}
