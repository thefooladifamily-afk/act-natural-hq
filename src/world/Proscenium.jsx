// Proscenium — the grand Art Deco architectural frame for the screen.
//
// Visual translation 2026-10-03 (from the approved inspiration): the screen
// is a jewel in a setting — a massive stepped gold Deco frame with a fan
// crest, fluted pilasters, and corner blocks. The frame IS the front wall's
// architecture; the screen hangs INSIDE it and rolls UP behind the frieze
// for the vote reveal (the garden vista shows through the gold-trimmed
// proscenium arch, never a domestic window).
//
// Static merged geometry: cream 1 draw call, gold 1, sunburst 1, glow 1.
import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { canvasTexture } from './materials.js'

const Z = -1.5 // pilaster center plane; front face at -1.41

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  return g
}

// Gold sunburst fan on deep bronze — the Deco crown, painted once.
function sunburstTexture() {
  return canvasTexture(1024, 160, (g, w, h) => {
    g.fillStyle = '#241a10'; g.fillRect(0, 0, w, h)
    const cx = w / 2, cy = h + 12
    for (let i = 0; i <= 28; i++) {
      const a = Math.PI + (i / 28) * Math.PI // fan across the top
      const x2 = cx + Math.cos(a) * w * 0.52
      const y2 = cy + Math.sin(a) * w * 0.52
      g.strokeStyle = i % 2 ? '#c9a227' : '#8a6d1f'
      g.lineWidth = i % 2 ? 8 : 3
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(x2, y2); g.stroke()
    }
    // half-disc hub
    g.fillStyle = '#c9a227'
    g.beginPath(); g.arc(cx, cy, 30, Math.PI, 0); g.fill()
    // gold border bands
    g.fillStyle = '#c9a227'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10)
  })
}

export default function Proscenium() {
  const creamGeo = useMemo(() => {
    const parts = []
    for (const s of [-1, 1]) {
      const x = s * 1.95
      parts.push(box(0.62, 0.50, 0.20, x, 0.30, Z))  // stepped base
      parts.push(box(0.50, 0.90, 0.18, x, 1.00, Z))  // lower shaft
      parts.push(box(0.58, 0.14, 0.20, x, 1.52, Z))  // mid step
      parts.push(box(0.44, 1.70, 0.18, x, 2.60, Z))  // upper shaft (extended for 4.2m walls)
      parts.push(box(0.56, 0.16, 0.20, x, 3.53, Z))  // capital
      parts.push(box(0.50, 0.50, 0.22, s * 2.02, 3.87, Z)) // corner block
      parts.push(box(0.34, 0.14, 0.24, s * 2.02, 4.05, Z)) // corner cap
    }
    parts.push(box(4.46, 0.52, 0.18, 0, 3.87, Z))     // frieze
    return mergeGeometries(parts)
  }, [])

  const goldGeo = useMemo(() => {
    const parts = []
    for (const s of [-1, 1]) {
      const x = s * 1.95
      parts.push(box(0.05, 3.40, 0.03, s * 1.68, 2.00, -1.40)) // inner trim
      parts.push(box(0.64, 0.07, 0.21, x, 0.585, Z))           // base band
      parts.push(box(0.60, 0.06, 0.21, x, 2.10, Z))            // mid band
      parts.push(box(0.58, 0.06, 0.21, x, 3.53, Z))            // capital band
      for (const fx of [-0.12, 0, 0.12])                       // fluting
        parts.push(box(0.045, 2.90, 0.02, x + fx, 2.00, -1.405))
      parts.push(box(0.52, 0.06, 0.23, s * 2.02, 3.63, Z))     // corner trim
      // sconce shade: small half-dome shell on the pilaster face
      const shade = new THREE.CylinderGeometry(0.09, 0.13, 0.10, 12, 1, true)
      shade.translate(x, 2.60, -1.38)
      parts.push(shade)
    }
    parts.push(box(4.46, 0.06, 0.19, 0, 4.11, Z)) // frieze crown band
    parts.push(box(4.46, 0.06, 0.19, 0, 3.63, Z)) // frieze base band
    return mergeGeometries(parts)
  }, [])

  const glowGeo = useMemo(() => {
    const parts = []
    for (const s of [-1, 1]) {
      const bulb = new THREE.SphereGeometry(0.045, 10, 8)
      bulb.translate(s * 1.95, 2.56, -1.38)
      parts.push(bulb)
    }
    return mergeGeometries(parts)
  }, [])

  const sunTex = useMemo(sunburstTexture, [])

  return (
    <group name="screeningRoom.proscenium">
      <mesh geometry={creamGeo}>
        <meshLambertMaterial color={0xece0c8} />
      </mesh>
      <mesh geometry={goldGeo}>
        <meshLambertMaterial color={0xc9a227} emissive={0x6b4e12} emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0, 3.87, -1.405]}>
        <planeGeometry args={[4.3, 0.44]} />
        <meshBasicMaterial map={sunTex} toneMapped={false} />
      </mesh>
      {/* sconce bulbs: faked warm glow, zero light cost */}
      <mesh geometry={glowGeo}>
        <meshBasicMaterial color={0xffca7a} toneMapped={false} />
      </mesh>
    </group>
  )
}
