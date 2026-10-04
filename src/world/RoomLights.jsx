// RoomLights — the Screening Room's three lights, with a theatrical dimmer.
//
// The staged recut beat (Director.playRecut) dims the room to ~30% while
// Marlow re-cuts the film around the visitor's words, then restores full
// light for Gary's reaction. hq.lights.dimTo(t) sets the target; a useFrame
// lerps intensities toward it (no pops, no React re-render).
//
// META-NATIVE MAGIC (Task F): the recut also shifts color temperature
// (warm amber while dimmed — cinema hush) and spills the screen's glow
// onto the characters via a small shadowless point light at the screen.
// setWarmth(v) / setGlow(v) drive both; the Director owns the timing.
//
// The perf governor (Task D) also drives these lights: shadow-mapSize
// step-downs and the shadow kill-switch go through hq.lights.dir().
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { hq } from '../hq.js'

// Base intensities — the single source of truth for the room's light rig.
export const LIGHT_BASE = { dir: 1.35, hemi: 0.55, amb: 0.25 }

// Color temps: neutral projection white vs the warm amber of a dimmed cinema.
const COL_NEUTRAL = new THREE.Color(0xffe0b0)
const COL_WARM = new THREE.Color(0xff9e5e)
const _col = new THREE.Color() // module temp: no per-frame allocation

export default function RoomLights() {
  const dir = useRef()
  const hemi = useRef()
  const amb = useRef()
  const glow = useRef()

  useEffect(() => {
    const api = {
      target: 1,
      _level: 1,
      warmthTarget: 0,
      _warmth: 0,
      glowTarget: 0,
      _glow: 0,
      dimTo(t) { this.target = t },
      // Task F: warm the room (1) or cool it back (0); screen-glow spill.
      setWarmth(v) { this.warmthTarget = v },
      setGlow(v) { this.glowTarget = v },
      // Governor accessors (no per-frame allocation: refs closed over).
      dirLight() { return dir.current || null },
      applyLevel(level) {
        this._level = level
        if (dir.current) dir.current.intensity = LIGHT_BASE.dir * level
        if (hemi.current) hemi.current.intensity = LIGHT_BASE.hemi * level
        if (amb.current) amb.current.intensity = LIGHT_BASE.amb * level
      },
    }
    hq.lights = api
    return () => { if (hq.lights === api) hq.lights = null }
  }, [])

  useFrame((_, dt) => {
    const L = hq.lights
    if (!L || !dir.current) return
    const k = Math.min(1, dt * 3)
    const next = L._level + (L.target - L._level) * k
    if (Math.abs(next - L._level) > 0.0005) L.applyLevel(next)
    // Color temperature: drift toward warm amber as the room dims.
    L._warmth += (L.warmthTarget - L._warmth) * k
    if (Math.abs(L._warmth - (dir.current.userData._w || 0)) > 0.001) {
      _col.lerpColors(COL_NEUTRAL, COL_WARM, Math.max(0, Math.min(1, L._warmth)))
      dir.current.color.copy(_col)
      dir.current.userData._w = L._warmth
    }
    // Screen glow: the replay spills cool projection light onto the cast.
    L._glow += (L.glowTarget - L._glow) * k
    if (glow.current) glow.current.intensity = L._glow * 0.85
  })

  return (
    <>
      {/* the ONE shadow-casting light (perf law) */}
      <directionalLight
        ref={dir}
        position={[18, 30, 12]}
        intensity={LIGHT_BASE.dir}
        color={0xffe0b0}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-bias={-0.0004}
      />
      {/* Theater direction (blueprint §17): the whole rig runs warm. The old
          cool sky fill fought the luxurious register — replaced with warm
          bounce. The recut's cool screen-glow spill is untouched (it's a
          motivated projection source, not room fill). */}
      <hemisphereLight ref={hemi} args={[0xffd9a8, 0x8a7a5a, LIGHT_BASE.hemi]} />
      <ambientLight ref={amb} intensity={LIGHT_BASE.amb} />
      {/* Task F: screen-glow spill — shadowless point light, off unless the
          recut replay is running. One extra light, zero extra passes. */}
      <pointLight
        ref={glow}
        position={[0, 1.7, -0.9]}
        color={0xbfd9ff}
        intensity={0}
        distance={8}
        decay={2}
      />
    </>
  )
}
