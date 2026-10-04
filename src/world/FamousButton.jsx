// FamousButton — physical in-headset 3D "FAMOUS" button (Amy 2026-10-03).
//
// The flat HTML HUD has a Famous button that plays /audio/famous.mp3 via
// hq.voice.performFamous(), but it doesn't exist in XR. This is the
// pinchable in-world equivalent: a gold pedestal button to the visitor's
// right, wired through the unified interaction system (interactives.js
// registry → GazeDwell → activate()).
//
// HANDS-FIRST GEOMETRY (seated, no controllers):
// - Pedestal at [0.68, 0, 1.72], button top at y≈1.02 — inside the
//   comfortable gaze cone, right of the vote-card arc, clear of the
//   talk console at [0, 1.02, 1.85].
// - Activation: gaze dwell 1.2s OR pinch/tap on the gaze target — same as
//   every other control. The button physically depresses on activation.
//
// ADDITIVE ONLY: calls the existing hq.voice.performFamous() — no audio
// reimplementation. 3 draw calls (pedestal, button, label). Quest-safe:
// trivial geometry, one canvas label texture, zero lights.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { canvasTexture } from './materials.js'
import { registerInteractive } from '../interaction/interactives.js'
import { useFocusGlow } from '../interaction/useFocusGlow.js'
import { REDUCED_MOTION } from '../util/reducedMotion.js'
import { useHQ } from '../hq-context.jsx'

const POS = [0.68, 0, 1.72]
// Pedestal top trim spans y 0.895–0.945; button (h=0.05) sits on it.
const BUTTON_REST_Y = 0.97
const BUTTON_PRESS_DEPTH = 0.02

function labelTexture() {
  return canvasTexture(512, 160, (g, w, h) => {
    g.fillStyle = 'rgba(10, 14, 20, 0.88)'; g.fillRect(0, 0, w, h)
    const gold = g.createLinearGradient(0, 0, w, 0)
    gold.addColorStop(0, '#e8c860'); gold.addColorStop(0.5, '#c9a227'); gold.addColorStop(1, '#e8c860')
    g.strokeStyle = gold; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16)
    g.textAlign = 'center'; g.fillStyle = '#e8c860'
    g.font = 'bold 64px sans-serif'
    g.fillText('♪ FAMOUS ♪', w / 2, h / 2 + 22)
  })
}

export default function FamousButton() {
  const hq = useHQ()
  const button = useRef()
  const labelRef = useRef()
  const labelTex = useMemo(labelTexture, [])
  const press = useRef(0) // 0..1 press amount, decays in useFrame

  const rec = useMemo(() => {
    const r = {
      id: 'screeningRoom.famousButton', kind: 'famous', object3D: null, radius: 0.28,
      onActivate: () => {
        press.current = 1 // physical press feedback
        const v = hq.voice
        if (!v) return
        // iOS requires AudioContext resume on user gesture (same as HUD)
        if (v.resume) { try { v.resume() } catch (e) { /* non-fatal */ } }
        v.performFamous()
      },
    }
    const unreg = registerInteractive(r)
    return { r, unreg }
  }, [hq])
  useEffect(() => () => rec.unreg(), [rec])
  useFocusGlow(rec, button)

  useFrame((state, rawDt) => {
    if (!rec.r.object3D && button.current) rec.r.object3D = button.current
    const dt = Math.min(0.05, rawDt)
    // Press decay: button springs back up after activation.
    if (press.current > 0.001) {
      press.current = Math.max(0, press.current - dt * 4)
    } else {
      press.current = 0
    }
    if (button.current) {
      const y = REDUCED_MOTION
        ? BUTTON_REST_Y - press.current * BUTTON_PRESS_DEPTH
        : BUTTON_REST_Y - press.current * BUTTON_PRESS_DEPTH + Math.sin(state.clock.elapsedTime * 2) * 0.004
      button.current.position.y = y
    }
    // Label billboards toward the seated visitor; the pedestal stays vertical.
    if (labelRef.current) labelRef.current.lookAt(0, 1.28, 2.5)
  })

  return (
    <group position={POS} name="screeningRoom.famousButton">
      {/* pedestal: dark emerald column with gold trim — static, 1 draw call */}
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[0.22, 0.9, 0.22]} />
        <meshLambertMaterial color={0x0d3a2e} />
      </mesh>
      <mesh position={[0, 0.92, 0]}>
        <boxGeometry args={[0.26, 0.05, 0.26]} />
        <meshLambertMaterial color={0xc9a227} emissive={0x6b4e12} emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[0.28, 0.06, 0.28]} />
        <meshLambertMaterial color={0xc9a227} emissive={0x6b4e12} emissiveIntensity={0.35} />
      </mesh>
      {/* the button: bright gold, unlit so it always reads as interactive
          even in shadow. This is the registered interactive mesh. */}
      <mesh ref={button} position={[0, BUTTON_REST_Y, 0]} name="screeningRoom.famousButton.btn">
        <cylinderGeometry args={[0.085, 0.095, 0.05, 24]} />
        <meshBasicMaterial color={0xe8c860} toneMapped={false} />
      </mesh>
      {/* floating label above the button — billboards to the visitor */}
      <mesh ref={labelRef} position={[0, 1.28, 0]}>
        <planeGeometry args={[0.42, 0.13]} />
        <meshBasicMaterial map={labelTex} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}
