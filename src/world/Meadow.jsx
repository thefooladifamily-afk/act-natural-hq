// Meadow — the golden-hour HQ world, ported from hq-v3 and perf-trimmed.
//
// PERF LAW (Quest 3: an earlier build froze Amy's Quest — non-negotiable):
//   ≤300K scene triangles, ≤80 draw calls, one shadow-casting directional
//   light max, zero post-processing, pixel ratio ≤1.5, 72fps floor.
// Techniques: InstancedMesh for grass/flowers/trees/fence/fireflies/butterflies,
// merged BufferGeometries for barn/oak canopy/chimes, shared materials,
// no per-frame allocation, grass sway baked out (static), butterflies +
// chimes + fireflies animated (few objects).
//
// The whole environment lives under <group name="hq-environment"> so MR
// "YOUR ROOM" mode can hide it in one flag flip (SceneUnderstanding.jsx).
import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { lambert, basic, canvasTexture, rnd, reseed } from './materials.js'
import { hq } from '../hq.js'
import ScreeningRoom from './ScreeningRoom.jsx'
import LoftRoom from './LoftRoom.jsx'
import RoomLights from './RoomLights.jsx'
import ProjectorBeam from './ProjectorBeam.jsx'

// RoomShell — the approved Filmmaker's Loft (room-bake.glb) with a guaranteed
// fallback. ?loft=0 forces the procedural wood room (debug).
// If the GLB fails to load or merge, LoftRoom calls onError and the
// procedural ScreeningRoom takes over — the show never breaks on a room.
// The approved theater direction builds on the procedural room (blueprint
// §17 supersedes the charcoal-loft GLB). The GLB path stays available as an
// explicit opt-in (?loft=1) for debug — never as a timed race that can
// double-mount rooms.
const USE_LOFT =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('loft') === '1'

function RoomShell() {
  const [loftFailed, setLoftFailed] = useState(false)
  // Diagnosability (audit): record which room path is active so a Quest
  // tester can report it without a console. hq.loft.path is set by LoftRoom
  // itself on success/timeout/error; the procedural fallback sets it here.
  if (USE_LOFT && !loftFailed) return <LoftRoom onError={() => setLoftFailed(true)} />
  if (!hq.loft) hq.loft = { ready: true, path: 'fallback-procedural' }
  return <ScreeningRoom />
}

reseed(1234567)

// ---------- panorama backdrop: the flower field through the window ----------
// The seamless meadow 360 (equirect, 2:1) on an open cylinder OUTSIDE the
// window. It is the DISTANT view, not the room: the 3D meadow foreground
// gives parallax, this gives the horizon. Warm-tinted toward golden hour
// so it grades with the 3D lighting. The hero of the pano (oak + swing)
// sits at image center (u=0.5), which maps to -Z — straight out the window.
function Panorama() {
  const tex = useMemo(() => {
    const t = new THREE.TextureLoader().load('./pano/hq-meadow-360-seamless.jpg')
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [])
  return (
    <mesh rotation={[0, 0, 0]}>
      <cylinderGeometry args={[60, 60, 36, 48, 1, true]} />
      <meshBasicMaterial
        map={tex}
        side={THREE.BackSide}
        fog={false}
        color={0xffe0b0}
        depthWrite={false}
      />
    </mesh>
  )
}

// ---------- ground (one draw call, painted grass swirls) ----------
function Ground() {
  const geo = useMemo(() => {
    const g = new THREE.CircleGeometry(55, 72)
    const pos = g.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i)
      const swirl = Math.sin(x * 0.35 + y * 0.21) * Math.cos(y * 0.42 - x * 0.13)
      c.setHSL(0.29 + swirl * 0.035, 0.5, 0.3 + swirl * 0.05)
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return g
  }, [])
  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <meshLambertMaterial vertexColors />
    </mesh>
  )
}

// ---------- instanced scatter ----------
function useScatter(count, area, yFn) {
  return useMemo(() => {
    const arr = []
    for (let i = 0; i < count; i++) {
      const r = 3 + Math.sqrt(rnd()) * area
      const a = rnd() * Math.PI * 2
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 2
      if (x > -3.2 && x < 3.2 && z > -1.8 && z < 3.4) continue // keep the room footprint clear (floor is 6.15x4.95 at z=0.8)
      arr.push({ x, z, y: yFn ? yFn(x, z) : 0, s: 0.6 + rnd() * 0.9, rot: rnd() * Math.PI * 2 })
    }
    return arr
  }, [count, area])
}

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _s = new THREE.Vector3()
const _p = new THREE.Vector3()
const _c = new THREE.Color()

function Grass({ count = 1600 }) {
  const ref = useRef()
  const items = useScatter(count, 26)
  const geo = useMemo(() => new THREE.ConeGeometry(0.035, 0.5, 5), [])
  useMemo(() => {
    // static matrices set once — no per-frame cost (scent of v3, none of the CPU)
  }, [])
  useFrame(() => {
    const im = ref.current
    if (!im || im.userData.built) return
    items.forEach((it, i) => {
      _e.set((rnd() - 0.5) * 0.25, it.rot, (rnd() - 0.5) * 0.25)
      _q.setFromEuler(_e)
      _p.set(it.x, 0.22 * it.s, it.z)
      _s.set(it.s, it.s * (0.8 + rnd() * 0.6), it.s)
      _m.compose(_p, _q, _s)
      im.setMatrixAt(i, _m)
      _c.setHSL(0.26 + rnd() * 0.08, 0.55, 0.3 + rnd() * 0.14)
      im.setColorAt(i, _c)
    })
    im.count = items.length
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    im.userData.built = true
  })
  return (
    <instancedMesh ref={ref} args={[geo, undefined, count]} frustumCulled={false}>
      <meshLambertMaterial color={0xffffff} />
    </instancedMesh>
  )
}

function Flowers({ count = 380 }) {
  const ref = useRef()
  const items = useScatter(count, 20)
  const geo = useMemo(() => new THREE.IcosahedronGeometry(0.05, 0), [])
  const palette = [0xff8fa3, 0xffd166, 0xffffff, 0xc39bff, 0xff6b6b]
  useFrame(() => {
    const im = ref.current
    if (!im || im.userData.built) return
    items.forEach((it, i) => {
      _q.setFromEuler(_e.set(0, it.rot, 0))
      _p.set(it.x, 0.1 * it.s + 0.06, it.z)
      _s.set(it.s, it.s, it.s)
      _m.compose(_p, _q, _s)
      im.setMatrixAt(i, _m)
      _c.set(palette[(rnd() * palette.length) | 0])
      im.setColorAt(i, _c)
    })
    im.count = items.length
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    im.userData.built = true
  })
  return <instancedMesh ref={ref} args={[geo, undefined, count]} frustumCulled={false}>
    <meshLambertMaterial color={0xffffff} emissive={0x222222} />
  </instancedMesh>
}

function Treeline() {
  const trunks = useRef(), canopies = useRef()
  const items = useMemo(() => {
    const arr = []
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rnd() * 0.3
      const r = 34 + rnd() * 22
      arr.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.8 + rnd() * 1.1 })
    }
    return arr
  }, [])
  // merged 3-tier cone canopy = 1 geometry, instanced 16x = 1 draw call
  const canopyGeo = useMemo(() => {
    const parts = []
    const tiers = [[2.6, 3.2, 2.2], [2.0, 2.6, 4.0], [1.4, 2.0, 5.6]]
    for (const [r, h, y] of tiers) {
      const c = new THREE.ConeGeometry(r, h, 7)
      c.translate(0, y, 0)
      parts.push(c)
    }
    return mergeGeometries(parts)
  }, [])
  const trunkGeo = useMemo(() => new THREE.CylinderGeometry(0.35, 0.5, 3.4, 6), [])
  useFrame(() => {
    for (const [im, y] of [[trunks.current, 1.7], [canopies.current, 0]]) {
      if (!im || im.userData.built) continue
      items.forEach((it, i) => {
        _q.setFromEuler(_e.set(0, it.rot || 0, 0))
        _p.set(it.x, y, it.z)
        _s.set(it.s, it.s, it.s)
        _m.compose(_p, _q, _s)
        im.setMatrixAt(i, _m)
        _c.setHSL(0.33, 0.42, 0.24 + (i % 3) * 0.03)
        im.setColorAt(i, _c)
      })
      im.instanceMatrix.needsUpdate = true
      if (im.instanceColor) im.instanceColor.needsUpdate = true
      im.userData.built = true
    }
  })
  return (
    <group>
      <instancedMesh ref={trunks} args={[trunkGeo, undefined, 16]} frustumCulled={false}>
        <meshLambertMaterial color={0x6b4a2f} />
      </instancedMesh>
      <instancedMesh ref={canopies} args={[canopyGeo, undefined, 16]} frustumCulled={false}>
        <meshLambertMaterial color={0xffffff} />
      </instancedMesh>
    </group>
  )
}

function Bushes() {
  const ref = useRef()
  const items = useScatter(22, 24)
  const geo = useMemo(() => new THREE.SphereGeometry(0.7, 10, 8), [])
  useFrame(() => {
    const im = ref.current
    if (!im || im.userData.built) return
    items.forEach((it, i) => {
      _q.setFromEuler(_e.set(0, it.rot, 0))
      _p.set(it.x, 0.35 * it.s, it.z)
      _s.set(it.s * 1.4, it.s * 0.8, it.s * 1.4)
      _m.compose(_p, _q, _s)
      im.setMatrixAt(i, _m)
      _c.setHSL(0.3, 0.45, 0.22 + rnd() * 0.08)
      im.setColorAt(i, _c)
    })
    im.count = items.length
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    im.userData.built = true
  })
  return <instancedMesh ref={ref} args={[geo, undefined, 22]} frustumCulled={false}>
    <meshLambertMaterial color={0xffffff} />
  </instancedMesh>
}

function Rocks() {
  const ref = useRef()
  const items = useScatter(16, 22)
  const geo = useMemo(() => new THREE.DodecahedronGeometry(0.3, 0), [])
  useFrame(() => {
    const im = ref.current
    if (!im || im.userData.built) return
    items.forEach((it, i) => {
      _q.setFromEuler(_e.set(rnd() * 3, it.rot, rnd() * 3))
      _p.set(it.x, 0.12, it.z)
      _s.set(it.s, it.s * 0.7, it.s)
      _m.compose(_p, _q, _s)
      im.setMatrixAt(i, _m)
    })
    im.count = items.length
    im.instanceMatrix.needsUpdate = true
    im.userData.built = true
  })
  return <instancedMesh ref={ref} args={[geo, undefined, 16]} frustumCulled={false}>
    <meshLambertMaterial color={0x9a958c} />
  </instancedMesh>
}

function Fence() {
  const posts = useRef(), rails = useRef()
  const N = 18
  const items = useMemo(() => {
    const arr = []
    for (let i = 0; i < N; i++) {
      const x = -14 + i * 1.7
      arr.push({ x, z: 10 + Math.sin(i * 0.5) * 0.8 })
    }
    return arr
  }, [])
  const postGeo = useMemo(() => new THREE.BoxGeometry(0.14, 1.1, 0.14), [])
  const railGeo = useMemo(() => new THREE.BoxGeometry(1.75, 0.09, 0.06), [])
  useFrame(() => {
    if (posts.current && !posts.current.userData.built) {
      items.forEach((it, i) => {
        _q.identity(); _p.set(it.x, 0.55, it.z); _s.set(1, 1, 1)
        _m.compose(_p, _q, _s)
        posts.current.setMatrixAt(i, _m)
      })
      posts.current.instanceMatrix.needsUpdate = true
      posts.current.userData.built = true
    }
    if (rails.current && !rails.current.userData.built) {
      let k = 0
      for (let i = 0; i < N - 1; i++) {
        for (const y of [0.55, 0.9]) {
          const a = items[i], b = items[i + 1]
          _q.identity()
          _p.set((a.x + b.x) / 2, y, (a.z + b.z) / 2)
          _s.set(1, 1, 1)
          _m.compose(_p, _q, _s)
          rails.current.setMatrixAt(k++, _m)
        }
      }
      rails.current.count = k
      rails.current.instanceMatrix.needsUpdate = true
      rails.current.userData.built = true
    }
  })
  return (
    <group>
      <instancedMesh ref={posts} args={[postGeo, undefined, N]} frustumCulled={false}>
        <meshLambertMaterial color={0x7a5c3e} />
      </instancedMesh>
      <instancedMesh ref={rails} args={[railGeo, undefined, (N - 1) * 2]} frustumCulled={false}>
        <meshLambertMaterial color={0x7a5c3e} />
      </instancedMesh>
    </group>
  )
}

// ---------- the old oak (static trunk + canopy; the SWING hangs off it) ----------
export const OAK_POS = [-4.6, 0, -5.4]
export const SWING_ANCHOR = [-3.3, 4.6, -5.2] // branch point the ropes hang from

function Oak() {
  const canopyGeo = useMemo(() => {
    const parts = []
    const blobs = [
      [0, 6.4, 0, 2.9], [2.2, 5.6, 0.8, 2.0], [-2.1, 5.8, -0.6, 2.1],
      [0.6, 7.6, -0.4, 2.2], [-0.8, 7.2, 1.0, 1.8], [1.4, 6.6, -1.6, 1.7],
    ]
    for (const [x, y, z, r] of blobs) {
      const s = new THREE.SphereGeometry(r, 12, 9)
      s.translate(x, y, z)
      parts.push(s)
    }
    return mergeGeometries(parts)
  }, [])
  return (
    <group position={OAK_POS}>
      <mesh position={[0, 2.4, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.85, 5.2, 8]} />
        <primitive object={lambert(0x5e4128)} attach="material" />
      </mesh>
      <mesh geometry={canopyGeo}>
        <meshLambertMaterial color={0x4d7a35} />
      </mesh>
      {/* rope swing — the pivot lives here; Director animates it */}
      <SwingRopes />
    </group>
  )
}

// ---------- swing (ropes + seat, Director-driven pivot) ----------
function SwingRopes() {
  const pivot = useRef()
  const seat = useRef()
  useFrame(() => {
    // expose handles to the Director (v3 pattern: swingPivot / swingSeat)
    if (pivot.current && !hq.swing.pivot) {
      hq.swing.pivot = pivot.current
      hq.swing.seat = seat.current
    }
  })
  const ropeMat = useMemo(() => lambert(0xb09a72), [])
  return (
    <group ref={pivot} position={[1.3, 4.6, 0.2]}>
      {[-0.5, 0.5].map((x) => (
        <mesh key={x} position={[x, -2.1, 0]} material={ropeMat}>
          <cylinderGeometry args={[0.025, 0.025, 4.2, 6]} />
        </mesh>
      ))}
      <mesh ref={seat} position={[0, -4.2, 0]} material={ropeMat} castShadow>
        <boxGeometry args={[1.3, 0.09, 0.45]} />
      </mesh>
    </group>
  )
}

// ---------- wind chimes ----------
export const CHIME_POS = [2.3, 0, -3.1]
function Chimes() {
  const group = useRef()
  const tubes = useMemo(() => {
    const parts = []
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const len = 0.5 + (i % 3) * 0.14
      const t = new THREE.CylinderGeometry(0.035, 0.035, len, 8)
      t.translate(Math.cos(a) * 0.22, -0.45 - len / 2, Math.sin(a) * 0.22)
      parts.push(t)
    }
    const disc = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12)
    disc.translate(0, -0.32, 0)
    parts.push(disc)
    return mergeGeometries(parts)
  }, [])
  useFrame((state) => {
    if (group.current) {
      const t = state.clock.elapsedTime
      group.current.rotation.z = Math.sin(t * 0.9) * 0.08 * (0.5 + hq.ambience.wind * 0.5)
      group.current.rotation.x = Math.cos(t * 0.63) * 0.06 * (0.5 + hq.ambience.wind * 0.5)
    }
  })
  return (
    <group position={[CHIME_POS[0], 3.4, CHIME_POS[2]]}>
      {/* shepherd's hook */}
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 1.8, 6]} />
        <primitive object={lambert(0x3a3a3a)} attach="material" />
      </mesh>
      <group ref={group}>
        <mesh geometry={tubes}>
          <meshLambertMaterial color={0xd8c98a} emissive={0x443d1a} />
        </mesh>
      </group>
    </group>
  )
}

// ---------- distant red barn (one merged mesh) ----------
function Barn() {
  const geo = useMemo(() => {
    const parts = []
    const body = new THREE.BoxGeometry(7, 3.6, 5)
    body.translate(0, 1.8, 0)
    parts.push(body)
    const roof = new THREE.CylinderGeometry(3.6, 3.6, 7.4, 3, 1)
    roof.rotateZ(Math.PI / 2); roof.rotateY(Math.PI / 2)
    roof.scale(1, 1, 0.55)
    roof.translate(0, 4.4, 0)
    parts.push(roof)
    return mergeGeometries(parts)
  }, [])
  return (
    <mesh geometry={geo} position={[26, 0, -34]} rotation={[0, -0.5, 0]}>
      <meshLambertMaterial color={0xa83c2e} />
    </mesh>
  )
}

// ---------- butterflies (12 × 2 wing quads, one InstancedMesh) ----------
function Butterflies({ count = 12 }) {
  const ref = useRef()
  const items = useMemo(() => {
    const arr = []
    for (let i = 0; i < count; i++) {
      let cx = (rnd() - 0.5) * 14
      let cz = -4.5 + (rnd() - 0.5) * 10
      if (Math.abs(cx) < 3.6 && cz > -2.2 && cz < 3.8) cx += cx >= 0 ? 7 : -7 // keep out of the room
      arr.push({
        cx, cz,
        r: 1 + rnd() * 2.4, h: 0.5 + rnd() * 0.8,
        sp: 0.3 + rnd() * 0.5, ph: rnd() * 6.28,
        flap: 6 + rnd() * 5,
        col: [0xffd166, 0xff8fa3, 0xffffff, 0xc39bff][i % 4],
      })
    }
    return arr
  }, [count])
  const geo = useMemo(() => new THREE.PlaneGeometry(0.10, 0.075), [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.9 }), [])
  useFrame((state) => {
    const im = ref.current
    if (!im) return
    const t = state.clock.elapsedTime
    let k = 0
    items.forEach((b, i) => {
      const a = t * b.sp + b.ph
      const x = b.cx + Math.cos(a) * b.r
      const z = b.cz + Math.sin(a * 1.3) * b.r
      const y = b.h + Math.sin(t * 1.7 + b.ph) * 0.25
      const flap = Math.sin(t * b.flap + b.ph) * 0.9
      for (const side of [-1, 1]) {
        _e.set(0, a + (side > 0 ? flap : -flap), 0)
        _q.setFromEuler(_e)
        _p.set(x + Math.cos(a + Math.PI / 2) * 0.08 * side, y, z)
        _s.set(1, 1, 1)
        _m.compose(_p, _q, _s)
        im.setMatrixAt(k, _m)
        _c.set(b.col)
        im.setColorAt(k, _c)
        k++
      }
    })
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geo, mat, count * 2]} frustumCulled={false} />
}

// ---------- fireflies (dusk magic; cheap) ----------
function Fireflies({ count = 36 }) {
  const ref = useRef()
  const items = useMemo(() => {
    const arr = []
    for (let i = 0; i < count; i++) {
      let fx = (rnd() - 0.5) * 20
      const fz = -2 + (rnd() - 0.5) * 16
      if (Math.abs(fx) < 3.6 && fz > -2.2 && fz < 3.8) fx += fx >= 0 ? 7 : -7 // keep out of the room
      arr.push({
        x: fx, z: fz,
        y: 0.4 + rnd() * 2.2, ph: rnd() * 6.28, sp: 0.4 + rnd() * 0.8,
      })
    }
    return arr
  }, [count])
  const geo = useMemo(() => new THREE.SphereGeometry(0.03, 6, 5), [])
  useFrame((state) => {
    const im = ref.current
    if (!im) return
    const t = state.clock.elapsedTime
    items.forEach((f, i) => {
      _q.identity()
      _p.set(
        f.x + Math.sin(t * f.sp + f.ph) * 0.8,
        f.y + Math.sin(t * f.sp * 1.4 + f.ph * 2) * 0.4,
        f.z + Math.cos(t * f.sp * 0.8 + f.ph) * 0.8
      )
      const s = 0.7 + 0.5 * Math.sin(t * 3 + f.ph * 3)
      _s.set(s, s, s)
      _m.compose(_p, _q, _s)
      im.setMatrixAt(i, _m)
    })
    im.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geo, undefined, count]} frustumCulled={false}>
    <meshBasicMaterial color={0xffe28a} transparent opacity={0.85} />
  </instancedMesh>
}

// ---------- two wandering ragdoll cats (merged blobs, v3 pattern) ----------
function Cats() {
  const refs = [useRef(), useRef()]
  const cats = useMemo(() => [
    { x: -2.5, z: -5.5, dir: 0.6, speed: 0.25, col: 0xe8dcc8, ph: 0 },
    { x: 2.5, z: -6.5, dir: 2.4, speed: 0.2, col: 0xcfc4b4, ph: 2.5 },
  ], [])
  const geo = useMemo(() => {
    const parts = []
    const body = new THREE.SphereGeometry(0.22, 10, 8)
    body.scale(1.5, 1, 1)
    body.translate(0, 0.22, 0)
    parts.push(body)
    const head = new THREE.SphereGeometry(0.13, 10, 8)
    head.translate(0.36, 0.38, 0)
    parts.push(head)
    for (const s of [-1, 1]) {
      const ear = new THREE.ConeGeometry(0.05, 0.09, 4)
      ear.translate(0.36, 0.5, s * 0.08)
      parts.push(ear)
    }
    const tail = new THREE.CylinderGeometry(0.035, 0.05, 0.5, 6)
    tail.rotateZ(1.1)
    tail.translate(-0.42, 0.35, 0)
    parts.push(tail)
    return mergeGeometries(parts)
  }, [])
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    refs.forEach((ref, i) => {
      const c = cats[i]
      if (!ref.current) return
      c.dir += Math.sin(t * 0.3 + c.ph) * dt * 0.5
      c.x += Math.cos(c.dir) * c.speed * dt
      c.z += Math.sin(c.dir) * c.speed * dt
      const d = Math.hypot(c.x, c.z + 6)
      if (d > 6) c.dir += Math.PI * dt * 2
      ref.current.position.set(c.x, Math.abs(Math.sin(t * 6 + c.ph)) * 0.03, c.z)
      ref.current.rotation.y = -c.dir
    })
  })
  return (
    <group>
      {cats.map((c, i) => (
        <mesh key={i} ref={refs[i]} geometry={geo} position={[c.x, 0, c.z]}>
          <meshLambertMaterial color={c.col} />
        </mesh>
      ))}
    </group>
  )
}

// ---------- assembly ----------
// Lights live OUTSIDE the environment group: in MR "your room" mode the
// whole virtual set hides, but the lights must keep lighting Gary/Marlow.
export default function Meadow() {
  return (
    <>
      {/* the ONE shadow-casting light (perf law) + theatrical dimmer.
          Lives OUTSIDE hq-environment: in MR "your room" mode the virtual
          set hides, but the lights must keep lighting Gary/Marlow. */}
      <RoomLights />
      <group name="hq-environment">
        <RoomShell />
        <ProjectorBeam />
        <Panorama />
        <Ground />
        <Grass />
        <Flowers />
        <Bushes />
        <Rocks />
        <Fence />
        <Oak />
        {/* non-essential FX: the governor (L6) hides these under load */}
        <group name="hq-fx"><Chimes /></group>
        <Barn />
        <group name="hq-fx"><Butterflies /></group>
        <Fireflies />
        <Cats />
      </group>
    </>
  )
}
