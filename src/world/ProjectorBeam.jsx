// ProjectorBeam — additive cone from the projector lens to the screen +
// dust motes. The single effect that makes a room read "cinema" instantly.
//
// Re-aimed 2026-10-03 for the theater set dressing: the projector sits on
// its pedestal stage-right (TheaterSet.PROJECTOR_LENS); the beam lands on
// the screen inside the proscenium. Cone orientation is computed from the
// two endpoints — no hand-tuned rotations.
//
// DUST MOTES (Amy 20-feature #13): 220 instanced motes drifting in the beam
// volume — ONE draw call, circular sprite texture (never squares), CPU
// update of 220 floats/frame is trivial. Restrained by design: warm,
// slow, inside the beam only.
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { PROJECTOR_LENS, SCREEN_CENTER } from './TheaterSet.jsx'

function moteTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30)
  grad.addColorStop(0, 'rgba(255,240,210,1)')
  grad.addColorStop(0.5, 'rgba(255,240,210,0.35)')
  grad.addColorStop(1, 'rgba(255,240,210,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const P0 = new THREE.Vector3(...PROJECTOR_LENS)
const P1 = new THREE.Vector3(...SCREEN_CENTER)
// The beam dissolves before it reaches the screen — a real beam diffuses;
// ending it early avoids a hard silhouette edge against the bright wall.
const P1S = P0.clone().lerp(P1, 0.82)
const SEG = P1S.clone().sub(P0)
const LEN = SEG.length()
const MID = P0.clone().add(P1S).multiplyScalar(0.5)
const QUAT = new THREE.Quaternion().setFromUnitVectors(
  new THREE.Vector3(0, 1, 0),
  SEG.clone().normalize().negate(), // cone apex (+y) sits at the projector
)

export default function ProjectorBeam() {
  // Dust motes distributed along the beam segment, radius widening to screen.
  const { positions, speeds } = useMemo(() => {
    const N = 220
    const pos = new Float32Array(N * 3)
    const spd = new Float32Array(N)
    const v = new THREE.Vector3()
    for (let i = 0; i < N; i++) {
      const t = Math.random()
      v.copy(P0).addScaledVector(SEG, t)
      const r = (0.12 + t * 0.75) * Math.sqrt(Math.random())
      const a = Math.random() * Math.PI * 2
      pos[i * 3] = v.x + Math.cos(a) * r
      pos[i * 3 + 1] = v.y + (Math.random() - 0.5) * 0.25
      pos[i * 3 + 2] = v.z + Math.sin(a) * r
      spd[i] = 0.05 + Math.random() * 0.15
    }
    return { positions: pos, speeds: spd }
  }, [])
  const moteTex = useMemo(moteTexture, [])
  const pointsRef = useRef()

  useFrame((state, dt) => {
    if (!pointsRef.current) return
    const p = pointsRef.current.geometry.attributes.position
    const t = state.clock.elapsedTime
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + Math.sin(t * 0.5 + i) * 0.0005 - speeds[i] * dt * 0.1
      p.setY(i, y < P0.y - 0.6 ? y + 1.2 : y)
    }
    p.needsUpdate = true
  })

  return (
    <group>
      {/* Beam cone: additive, projector lens -> screen. Subtle by design. */}
      <mesh position={MID} quaternion={QUAT}>
        <coneGeometry args={[0.70, LEN, 20, 1, true]} />
        <meshBasicMaterial
          color={0xfff2d9}
          transparent
          opacity={0.022}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Dust motes */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          map={moteTex}
          color={0xffe8c0}
          size={0.035}
          transparent
          opacity={0.55}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  )
}
