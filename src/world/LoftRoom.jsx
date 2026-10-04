// LoftRoom — the approved Filmmaker's Loft (Amy 2026-10-02).
//
// Photoreal industrial-chic: dark charcoal brick, polished concrete,
// oxblood rug, crystal chandeliers/sconces, filmmaking equipment
// (cinema camera dolly, LED panels, boom mic, film cans), leather chairs.
// Fully enclosed, no window.
//
// Loads ./rooms/room-bake.glb and merges its 43 meshes by material
// (43 → ~15 draw calls, 19.6K tris — well inside the Quest budget).
// The footprint matches the greybox play space (x ±3.08, z -1.68..3.28),
// so it mounts at the origin with no transform.
//
// FAILURE CONTRACT: any load/parse error calls onError() and renders
// nothing — the caller (RoomShell) falls back to the procedural
// ScreeningRoom. The show never breaks on a room asset.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { hq } from '../hq.js'

const GLB_URL = './rooms/room-bake.glb'

function mergeByMaterial(root) {
  root.updateMatrixWorld(true)
  const buckets = new Map() // material.uuid -> { material, geos: [] }
  const loose = [] // meshes that can't merge (attribute mismatch)
  root.traverse((o) => {
    if (!o.isMesh) return
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld)
    // Only merge closed triangle geometry with the standard baked set.
    const ok = g.index && g.attributes.position && g.attributes.normal && g.attributes.uv
    const mat = Array.isArray(o.material) ? o.material[0] : o.material
    if (!ok || !mat) { loose.push({ geo: g, mat }); return }
    const key = mat.uuid
    if (!buckets.has(key)) buckets.set(key, { material: mat, geos: [] })
    buckets.get(key).geos.push(g)
  })
  const group = new THREE.Group()
  let merged = 0, drawCalls = 0
  for (const { material, geos } of buckets.values()) {
    // All geos in a bucket share the attribute set (checked above).
    const mergedGeo = mergeGeometries(geos, false)
    geos.forEach((g) => g.dispose())
    if (!mergedGeo) { loose.push(...geos.map((geo) => ({ geo, mat: material }))); continue }
    group.add(new THREE.Mesh(mergedGeo, material))
    merged += geos.length
    drawCalls++
  }
  for (const { geo, mat } of loose) {
    group.add(new THREE.Mesh(geo, mat || new THREE.MeshBasicMaterial({ color: 0x222222 })))
    drawCalls++
  }
  return { group, merged, drawCalls }
}

export default function LoftRoom({ onError }) {
  const mount = useRef()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let dead = false
    // Quest defect #2 (audit): GLTFLoader has no timeout — a stalled 3.7MB
    // fetch leaves an empty scene with no fallback and no error. 12s is
    // generous for the file size; on timeout we trigger the same onError
    // path as a load failure, so the procedural room takes over.
    // hq.loft.path records WHICH room is active ('loft' | 'fallback' |
    // 'timeout') — diagnosable without a console.
    const t0 = performance.now()
    const timeout = setTimeout(() => {
      if (dead) return
      console.error(`[loft] GLB load timed out after ${Math.round(performance.now() - t0)}ms, falling back to procedural room`)
      hq.loft = { ready: false, path: 'timeout', ms: Math.round(performance.now() - t0) }
      setFailed(true); onError && onError()
    }, 12000)
    const loader = new GLTFLoader()
    loader.load(
      GLB_URL,
      (gltf) => {
        if (dead) return
        clearTimeout(timeout)
        try {
          const { group, merged, drawCalls } = mergeByMaterial(gltf.scene)
          group.name = 'screeningRoom.loft'
          if (mount.current) mount.current.add(group)
          hq.loft = { ready: true, path: 'loft', merged, drawCalls, ms: Math.round(performance.now() - t0) }
          console.log(`[loft] room-bake.glb live: ${merged} meshes → ${drawCalls} draw calls`)
        } catch (e) {
          console.error('[loft] merge failed, falling back to procedural room:', e)
          hq.loft = { ready: false, path: 'fallback', reason: 'merge-failed' }
          if (!dead) { setFailed(true); onError && onError() }
        }
      },
      undefined,
      (e) => {
        if (dead) return
        clearTimeout(timeout)
        console.error('[loft] GLB load failed, falling back to procedural room:', e)
        hq.loft = { ready: false, path: 'fallback', reason: 'load-failed' }
        if (!dead) { setFailed(true); onError && onError() }
      },
    )
    return () => { dead = true; clearTimeout(timeout) }
  }, [onError])

  if (failed) return null
  return <group ref={mount} name="screeningRoom.loftMount" />
}
