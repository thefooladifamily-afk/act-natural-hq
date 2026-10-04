// Seat — the visitor's seating position marker + reach-volume debug guides.
//
// The old blockout chair + "YOU (SEATED)" label sprite were removed
// 2026-10-03: the visitor now sits in a real director's chair (TheaterSet).
// What remains is the ?reach=1 greybox dressing guide (reach volume + FoV
// cone), hidden by default.
import * as THREE from 'three'

const SHOW = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('reach')

export default function Seat() {
  if (!SHOW) return null
  return (
    <group position={[0, 0, 2.5]}>
      {/* 0.6m reach volume at the seated shoulder point */}
      <mesh position={[0, 1.0, -0.2]}>
        <sphereGeometry args={[0.6, 24, 16]} />
        <meshBasicMaterial color={0x7fd8ff} wireframe transparent opacity={0.35} depthWrite={false} />
      </mesh>
      {/* comfortable-FoV cone guide: essential UI lives inside ~40° */}
      <mesh position={[0, 1.2, -0.6]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.55, 1.4, 24, 1, true]} />
        <meshBasicMaterial color={0xffd166} wireframe transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}
