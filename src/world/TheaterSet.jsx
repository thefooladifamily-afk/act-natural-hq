// TheaterSet — the production set dressing, all static merged geometry.
//
// Amy-approved layout (blueprint §17): the visitor's director's chair
// (emerald velvet + wood, "DIRECTOR" on the back), a vintage 35mm cinema
// camera on wooden tripod (stage left), a film projector on a pedestal
// (stage right — the beam lives in ProjectorBeam.jsx, re-aimed at it), a
// small side table with one film can, and gold Deco trim around the window.
//
// Buckets: woodDark 1 draw call, velvet 1, blackMetal 1, gold 1,
// chair-back text 1 = 5 total. Nothing here animates or casts real
// reflections — luxury is faked with baked color + emissive.
import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { canvasTexture } from './materials.js'

// Realistic brushed gold — vertical brushed-metal streaks over a metallic
// gradient. Amy 2026-10-03: "realistic gold texture" on the lanterns/sconces.
// Applied as the map on the gold bucket (sconce fixtures, pendant, trim).
function brushedGoldTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#e8c860'); bg.addColorStop(0.45, '#c9a227')
    bg.addColorStop(0.75, '#9a7a24'); bg.addColorStop(1, '#6b5218')
    g.fillStyle = bg; g.fillRect(0, 0, w, h)
    // brushed streaks — fine vertical lines, alternating light/dark
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * w
      g.strokeStyle = Math.random() > 0.5
        ? `rgba(255,230,160,${Math.random() * 0.14})`
        : `rgba(60,40,10,${Math.random() * 0.14})`
      g.lineWidth = Math.random() * 1.6
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 8, h); g.stroke()
    }
    // soft sheen bands — the light-catch that reads as polished metal
    for (let i = 0; i < 5; i++) {
      const y = Math.random() * h
      const s = g.createLinearGradient(0, y - 18, 0, y + 18)
      s.addColorStop(0, 'rgba(255,240,190,0)')
      s.addColorStop(0.5, `rgba(255,240,190,${0.08 + Math.random() * 0.10})`)
      s.addColorStop(1, 'rgba(255,240,190,0)')
      g.fillStyle = s; g.fillRect(0, y - 18, w, 36)
    }
  })
}

function box(w, h, d, x, y, z, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d)
  if (ry) g.rotateY(ry)
  g.translate(x, y, z)
  return g
}
function cyl(rt, rb, h, seg, x, y, z, rx = 0, rz = 0) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg)
  if (rx) g.rotateX(rx)
  if (rz) g.rotateZ(rz)
  g.translate(x, y, z)
  return g
}
// yaw so the group's +z faces the target point
function yawTo(fx, fz, tx, tz) {
  return Math.atan2(tx - fx, tz - fz)
}

// Strut: a wood beam running from point A to point B (for tripod legs
// that actually meet under the camera).
function strut(ax, ay, az, bx, by, bz, t) {
  const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz)
  const dir = b.clone().sub(a)
  const len = dir.length()
  const g = new THREE.BoxGeometry(t, len, t)
  g.translate(0, len / 2, 0) // base at A
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  g.applyQuaternion(q)
  g.translate(ax, ay, az)
  return g
}

function chairBackTexture() {
  return canvasTexture(512, 160, (g, w, h) => {
    g.fillStyle = '#0e5b47'; g.fillRect(0, 0, w, h)
    g.strokeStyle = '#c9a227'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20)
    g.fillStyle = '#c9a227'; g.textAlign = 'center'
    g.font = 'bold 64px sans-serif'
    g.fillText('D I R E C T O R', w / 2, h / 2 + 22)
  })
}

const CAM = { x: -2.35, z: 0.9 }  // vintage camera, stage left
const PROJ = { x: 2.35, z: 0.9 }  // projector, stage right
const SCREEN = { x: 0, z: -1.47 }

export default function TheaterSet() {
  const wood = useMemo(() => {
    const p = []
    // --- director's chair at (0,0,2.5), facing the screen (-z) ---
    const cx = 0, cz = 1.2
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      p.push(box(0.05, 0.52, 0.05, cx + sx * 0.20, 0.26, cz + sz * 0.18))
    for (const sx of [-1, 1]) {
      p.push(box(0.05, 0.55, 0.05, cx + sx * 0.20, 0.75, cz + 0.19)) // back posts
      p.push(box(0.05, 0.04, 0.42, cx + sx * 0.245, 0.68, cz))       // armrests
    }
    // --- camera tripod: three legs meeting under the column (wood) ---
    const hubX = CAM.x, hubZ = CAM.z, hubY = 1.02
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5
      p.push(strut(
        hubX + Math.sin(a) * 0.34, 0.02, hubZ + Math.cos(a) * 0.34, // foot
        hubX, hubY, hubZ,                                            // hub
        0.055,
      ))
    }
    p.push(box(0.07, 0.30, 0.07, CAM.x, 1.10, CAM.z)) // center column
    // --- projector pedestal (wood) ---
    p.push(box(0.52, 0.08, 0.52, PROJ.x, 0.04, PROJ.z))
    p.push(box(0.28, 1.00, 0.28, PROJ.x, 0.54, PROJ.z))
    p.push(box(0.46, 0.05, 0.46, PROJ.x, 1.06, PROJ.z))
    // --- side table (wood) ---
    p.push(cyl(0.22, 0.22, 0.045, 18, 0.78, 0.56, 1.05))
    p.push(cyl(0.035, 0.05, 0.52, 10, 0.78, 0.28, 1.05))
    p.push(cyl(0.15, 0.17, 0.04, 14, 0.78, 0.02, 1.05))
    const g = mergeGeometries(p)
    p.forEach((x) => x.dispose())
    return g
  }, [])

  const velvet = useMemo(() => {
    const p = []
    p.push(box(0.46, 0.055, 0.42, 0, 0.50, 2.5))  // chair seat
    p.push(box(0.44, 0.16, 0.035, 0, 0.97, 1.39)) // chair backrest
    const g = mergeGeometries(p)
    p.forEach((x) => x.dispose())
    return g
  }, [])

  const metal = useMemo(() => {
    const p = []
    // --- vintage 35mm camera body + reels + lens, aimed at the stage ---
    const cyaw = yawTo(CAM.x, CAM.z, SCREEN.x, SCREEN.z)
    const put = (geo) => { geo.rotateY(cyaw); geo.translate(CAM.x, 0, CAM.z); p.push(geo) }
    put(box(0.34, 0.24, 0.44, 0, 1.28, 0))
    // twin film reels riding high on arms — the vintage silhouette
    put(box(0.05, 0.10, 0.05, -0.09, 1.44, -0.05))
    put(box(0.05, 0.10, 0.05, 0.09, 1.44, -0.05))
    put(cyl(0.11, 0.11, 0.055, 18, -0.09, 1.58, -0.05, 0, Math.PI / 2))
    put(cyl(0.11, 0.11, 0.055, 18, 0.09, 1.58, -0.05, 0, Math.PI / 2))
    put(cyl(0.055, 0.065, 0.20, 14, 0, 1.28, 0.30, Math.PI / 2)) // lens barrel
    put(box(0.17, 0.17, 0.10, 0, 1.28, 0.42))                    // matte box
    put(cyl(0.02, 0.02, 0.10, 8, 0.20, 1.28, 0, 0, Math.PI / 2)) // crank
    // --- projector body + reels + lens, aimed at the screen ---
    const pyaw = yawTo(PROJ.x, PROJ.z, SCREEN.x, SCREEN.z)
    const putP = (geo) => { geo.rotateY(pyaw); geo.translate(PROJ.x, 0, PROJ.z); p.push(geo) }
    putP(box(0.42, 0.30, 0.52, 0, 1.24, 0))
    putP(cyl(0.15, 0.15, 0.045, 20, 0, 1.56, -0.13, 0, Math.PI / 2))
    putP(cyl(0.15, 0.15, 0.045, 20, 0, 1.56, 0.13, 0, Math.PI / 2))
    putP(cyl(0.05, 0.06, 0.22, 14, 0, 1.24, 0.36, Math.PI / 2)) // lens
    // --- one film can on the side table ---
    p.push(cyl(0.09, 0.09, 0.07, 18, 0.78, 0.62, 1.05))
    const g = mergeGeometries(p)
    p.forEach((x) => x.dispose())
    return g
  }, [])

  // (Studio spotlights were tried here 2026-10-03 and removed the same day:
  // at the room's intimate scale they read as black obstructions, not
  // equipment. The camera + projector carry the production story.)

  const gold = useMemo(() => {
    const p = []
    // (The medallion backdrop was removed 2026-10-03: Amy wants a plain wall
    // revealed when the screen rolls up — no framed panel, no window read.)
    // Wall sconces — vertical Deco fixtures on the side walls, mirrored.
    // (Bulbs live in the lit bucket.) Raised 2026-10-03 for 4.2m walls.
    for (const s of [-1, 1]) for (const z of [0.8, 2.2]) {
      p.push(box(0.05, 0.36, 0.18, s * 2.895, 2.70, z)) // backplate
      p.push(box(0.06, 0.10, 0.12, s * 2.895, 2.90, z)) // stepped cap
      p.push(box(0.06, 0.10, 0.12, s * 2.895, 2.50, z)) // stepped foot
      p.push(box(0.10, 0.16, 0.15, s * 2.84, 2.70, z))  // shade housing
    }
    // Crystal chandelier — Amy 2026-10-03: faceted crystal drops, warm core,
    // no expensive effects. All static merged geometry; sparkle is faked with
    // bright basic-material crystals (zero light cost, Quest-cheap).
    p.push(box(0.10, 0.06, 0.10, 0, 4.18, 0.9)) // ceiling canopy
    p.push(cyl(0.015, 0.015, 0.85, 8, 0, 3.75, 0.9)) // stem/chain
    const ring1 = new THREE.TorusGeometry(0.34, 0.025, 8, 24)
    ring1.rotateX(Math.PI / 2); ring1.translate(0, 3.30, 0.9); p.push(ring1)
    const ring2 = new THREE.TorusGeometry(0.20, 0.020, 8, 20)
    ring2.rotateX(Math.PI / 2); ring2.translate(0, 3.05, 0.9); p.push(ring2)
    for (let i = 0; i < 8; i++) { // arms: center hub to main ring
      const a = (i / 8) * Math.PI * 2
      const arm = cyl(0.012, 0.012, 0.34, 6, 0, 0, 0)
      arm.rotateZ(Math.PI / 2); arm.rotateY(-a)
      arm.translate(Math.cos(a) * 0.17, 3.30, 0.9 + Math.sin(a) * 0.17)
      p.push(arm)
      const cup = cyl(0.035, 0.025, 0.05, 8, Math.cos(a) * 0.34, 3.34, 0.9 + Math.sin(a) * 0.34)
      p.push(cup)
    }
    const hub = new THREE.SphereGeometry(0.06, 10, 8)
    hub.translate(0, 3.30, 0.9); p.push(hub)
    const finial = new THREE.SphereGeometry(0.045, 10, 8)
    finial.translate(0, 2.88, 0.9); p.push(finial)
    const g = mergeGeometries(p)
    p.forEach((x) => x.dispose())
    return g
  }, [])

  // Crystal drops — faceted octahedrons hanging from the chandelier rings.
  // One merged mesh, bright basic material: fake sparkle, zero light cost.
  const crystal = useMemo(() => {
    const p = []
    const drop = (x, y, z, s) => {
      const o = new THREE.OctahedronGeometry(s)
      o.translate(x, y, z); p.push(o)
    }
    for (let i = 0; i < 12; i++) { // main ring drops
      const a = (i / 12) * Math.PI * 2
      drop(Math.cos(a) * 0.34, 3.18, 0.9 + Math.sin(a) * 0.34, 0.035)
    }
    for (let i = 0; i < 8; i++) { // lower ring drops
      const a = (i / 8) * Math.PI * 2 + 0.4
      drop(Math.cos(a) * 0.20, 2.94, 0.9 + Math.sin(a) * 0.20, 0.028)
    }
    drop(0, 2.78, 0.9, 0.045) // finial drop
    const g = mergeGeometries(p)
    p.forEach((x) => x.dispose())
    return g
  }, [])

  // "lit" — every warm lamp glow in one draw call: sconce bulbs, pendant
  // globe, spotlight lenses. MeshBasicMaterial, zero light cost.
  const lit = useMemo(() => {
    const p = []
    for (const s of [-1, 1]) for (const z of [0.8, 2.2]) {
      const b = new THREE.SphereGeometry(0.045, 10, 8)
      b.translate(s * 2.80, 2.70, z)
      p.push(b)
    }
    const globe = new THREE.SphereGeometry(0.075, 12, 10)
    globe.translate(0, 3.15, 0.9)
    p.push(globe)
    const g = mergeGeometries(p)
    p.forEach((x) => x.dispose())
    return g
  }, [])

  // Studio spotlights were removed 2026-10-03 (read as black obstructions
  // at this intimate scale). The camera + projector carry the production
  // story; sconces + pendant + proscenium carry the theatrical lighting.

  const chairTex = useMemo(chairBackTexture, [])
  const goldTex = useMemo(brushedGoldTexture, [])

  return (
    <group name="screeningRoom.theaterSet">
      <mesh geometry={wood}>
        <meshLambertMaterial color={0x4a3421} />
      </mesh>
      <mesh geometry={velvet}>
        <meshLambertMaterial color={0x0e5b47} />
      </mesh>
      <mesh geometry={metal}>
        <meshLambertMaterial color={0x1f2226} />
      </mesh>
      <mesh geometry={gold}>
        <meshLambertMaterial map={goldTex} color={0xffffff} emissive={0x6b4e12} emissiveIntensity={0.35} />
      </mesh>
      {/* warm lamp glows: sconce bulbs, chandelier globe — one draw call */}
      <mesh geometry={lit}>
        <meshBasicMaterial color={0xffd9a0} toneMapped={false} />
      </mesh>
      {/* crystal drops: faceted sparkle, zero light cost — one draw call */}
      <mesh geometry={crystal}>
        <meshBasicMaterial color={0xfff6e0} toneMapped={false} />
      </mesh>
      {/* DIRECTOR on the chair back, facing the room behind the visitor */}
      <mesh position={[0, 0.97, 1.41]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.40, 0.125]} />
        <meshBasicMaterial map={chairTex} toneMapped={false} />
      </mesh>
    </group>
  )
}

// Re-exported for ProjectorBeam's aim point (lens tip, world).
const _pyaw = Math.atan2(SCREEN.x - PROJ.x, SCREEN.z - PROJ.z)
export const PROJECTOR_LENS = [
  PROJ.x + Math.sin(_pyaw) * 0.40,
  1.24,
  PROJ.z + Math.cos(_pyaw) * 0.40,
]
export const SCREEN_CENTER = [0, 1.6, -1.47]
