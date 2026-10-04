// GazeDwell — THE primary interaction. Carried over from hq-v3.
//
// Head-gaze raycast, 1.2s dwell activates, tap/trigger/pinch (XRSession's
// session-level `selectstart`) activates whatever the gaze holds — never a
// hand raycast (the v3 dead-tap bug). The reticle is a single draw call:
// one ring + one progress arc, rebuilt imperatively (no React re-renders).
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getInteractives } from './interactives.js'
import { activate } from './UnifiedInput.js'
import { hq } from '../hq.js'
import { noteFocus, record as recordMemory, noteTrail } from '../engine/SessionMemory.js'

const DWELL_S = 1.2
const DEVIATE_S = 4.0  // dwell this long off the expected path -> DEVIATE
const RETICLE_DIST = 2.5

// What the current director state "expects" the user to look at. Dwelling
// anywhere else past DEVIATE_S is a real deviation — the seed of the
// "break the movie" beat. Head-gaze only; never labeled eye tracking.
function isExpectedTarget(id, directorState) {
  if (!id) return true
  if (directorState === 'voting') return id.startsWith('screeningRoom.vote.')
  if (directorState === 'talk') return id.startsWith('screeningRoom.talk')
  if (directorState === 'watch') return id === 'screeningRoom.mainScreen'
  return true // transitions/stunt: everything is fair game
}

const _pv = new THREE.Vector3() // module temp: target world pos for memory
const _diff = new THREE.Vector3() // module temp: objPos - ray origin (no per-frame clone)
const _perp = new THREE.Vector3() // module temp: perpendicular component (no per-frame clone)

function targetPos(obj) {
  try {
    if (obj) { obj.getWorldPosition(_pv); return [_pv.x, _pv.y, _pv.z] }
  } catch (e) { /* no position */ }
  return null
}

export default function GazeDwell() {
  const camera = useThree((s) => s.camera)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const center = useMemo(() => new THREE.Vector2(0, 0), [])
  const dir = useMemo(() => new THREE.Vector3(), [])
  const objPos = useMemo(() => new THREE.Vector3(), [])

  const gazeRef = useRef({ id: null, kind: null, t: 0, onActivate: null })

  const visuals = useMemo(() => {
    const group = new THREE.Group()
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.028, 0.034, 40),
      new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.9, depthTest: false })
    )
    // Progress arc: ONE pre-built full ring; per-frame we only trim the
    // draw range (zero per-frame allocation — the perf law).
    const SEG = 48
    const arcGeo = new THREE.RingGeometry(0.036, 0.048, SEG, 1, -Math.PI / 2, Math.PI * 2)
    const arc = new THREE.Mesh(
      arcGeo,
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95, depthTest: false })
    )
    arc.userData.seg = SEG
    ring.renderOrder = 9999; arc.renderOrder = 9999
    group.add(ring, arc)
    group.visible = false
    return { group, ring, arc }
  }, [])

  useEffect(() => {
    camera.add(visuals.group)
    visuals.group.position.set(0, 0, -RETICLE_DIST)
    return () => { camera.remove(visuals.group) }
  }, [camera, visuals])

  useFrame((state, dt) => {
    const g = gazeRef.current
    // Ray from camera center.
    camera.getWorldDirection(dir)
    raycaster.set(camera.getWorldPosition(objPos), dir)

    // Nearest interactive under gaze (visible mesh + forgiving radius —
    // no invisible hit-proxy meshes, per the perf law).
    let best = null, bestDist = Infinity
    for (const it of getInteractives()) {
      if (!it.object3D) continue
      if (!isVisibleInScene(it.object3D)) continue
      it.object3D.getWorldPosition(objPos)
      // Zero per-frame allocation (audit fix): reuse module temps instead
      // of objPos.clone(). _diff = objPos - origin; along = projection.
      const along = _diff.copy(objPos).sub(raycaster.ray.origin).dot(raycaster.ray.direction)
      if (along < 0.3 || along > 30) continue
      const perp = _perp.copy(_diff).addScaledVector(raycaster.ray.direction, -along).length()
      const tol = (it.radius || 0.4) + along * 0.02 // slight angular slack
      if (perp < tol && along < bestDist) { bestDist = along; best = it }
    }

    const nowId = best ? best.id : null
    if (nowId !== g.id) {
      // Gaze-priority focus effect: tell the old target to dim, the new one
      // to glow. setFocus is optional — records without it are unaffected.
      if (g.id && g.rec && g.rec.setFocus) { try { g.rec.setFocus(false) } catch (e) {} }
      g.id = nowId
      g.kind = best ? best.kind : null
      g.t = 0
      g.focusT = 0 // continuous focus time — NOT reset by dwell activation
      g.activated = false
      g.devFired = false
      g.onActivate = best ? best.onActivate : null
      g.rec = best || null
      if (best && best.setFocus) { try { best.setFocus(true) } catch (e) {} }
      hq.gaze.current = best ? { id: best.id, kind: best.kind, onActivate: best.onActivate, object3D: best.object3D } : null
      // Behavioral Cinema Engine: focus gain is DISCOVERED (first time) or
      // RETURNED (came back after 4s+ away). The room remembers.
      if (best) {
        try {
          noteFocus(best.id, { source: 'head-gaze', position: targetPos(best.object3D) })
          noteTrail('gaze-target', best.id, null, targetPos(best.object3D))
        } catch (e) { /* memory is non-essential */ }
      }
    }
    if (best) {
      g.t += dt
      g.focusT += dt
      // Deviation: sustained attention off the expected path. Uses focusT
      // (not the dwell timer, which resets on activation). The "break the
      // movie" seed — real behavior, deterministic threshold.
      if (!g.devFired && g.focusT >= DEVIATE_S) {
        g.devFired = true
        const ds = hq.director ? hq.director.state : null
        if (!isExpectedTarget(best.id, ds)) {
          try {
            recordMemory('DEVIATE', {
              source: 'head-gaze', target: best.id,
              position: targetPos(best.object3D), duration: g.focusT * 1000,
              data: { directorState: ds },
            })
          } catch (e) { /* memory is non-essential */ }
        }
      }
      if (g.t >= DWELL_S) {
        g.t = 0
        g.activated = true
        activate(best, 'gaze-dwell') // the unified funnel (blip + errors)
      }
    }

    // Reticle: show while presenting or always? v3 always shows in XR.
    // Keep visible in XR; on desktop it's the mouse-less crosshair — show it.
    const vis = visuals
    vis.group.visible = true
    const hot = !!best
    const k = hot ? Math.min(1, g.t / DWELL_S) : 0
    const SEG = vis.arc.userData.seg
    vis.arc.visible = hot && k > 0.001
    vis.arc.geometry.setDrawRange(0, Math.floor(k * SEG) * 6)
    vis.arc.material.color.set(hot ? 0xffd166 : 0xfff6d8)
    const s = 1 + (hot ? 0.35 * k : 0)
    vis.group.scale.set(s, s, 1)
  })

  return null
}

function isVisibleInScene(obj) {
  let o = obj
  while (o) {
    if (!o.visible) return false
    o = o.parent
  }
  return true
}
