// AvatarSlot — one character presence (Gary or Marlow).
//
// PLACEHOLDER ART ONLY — the name tag says so in-scene. Abstract capsule +
// morph-target sphere head (15 Oculus visemes + jawOpen, exact names) + a
// simple mouth PLANE driven by the same viseme stream. The REAL Gary/Marlow
// GLBs (Blender build, same viseme morph names) slot in later via the
// `modelUrl` prop — LipSyncEngine.attachGLTF() drives the real visemes by
// name with no other code changes. Do NOT invent final character art here.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { lambert, canvasTexture, rnd } from '../world/materials.js'
import { registerAvatar, unregisterAvatar } from './avatarRegistry.js'
import { LipSyncEngine } from './lipsync.js'
import { registerInteractive } from '../interaction/interactives.js'
import { useHQ } from '../hq-context.jsx'

function nameSprite(text, accent) {
  const t = canvasTexture(512, 160, (g, w, h) => {
    g.fillStyle = 'rgba(20,26,18,.72)'; g.fillRect(0, 0, w, h)
    g.fillStyle = accent; g.textAlign = 'center'; g.font = 'bold 54px sans-serif'
    g.fillText(text, w / 2, 68)
    g.fillStyle = '#8a8f96'; g.font = 'bold 30px sans-serif'
    g.fillText('PLACEHOLDER', w / 2, 122)
  })
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }))
  s.scale.set(0.95, 0.3, 1)
  return s
}

export default function AvatarSlot({ id, label, accent, position, modelUrl = null }) {
  const hq = useHQ()
  const group = useRef()
  const headAnchor = useRef()
  const ring = useRef()

  const headMesh = useMemo(() => {
    const m = LipSyncEngine.makePlaceholderHead(0.17)
    m.material = lambert(0x8a6f5c)
    // Perf law: placeholder head does NOT cast shadows (tiny win, keeps the
    // single shadow light's render list short).
    m.castShadow = false
    return m
  }, [])

  // Mouth PLANE: a simple dark plane at the mouth that opens/closes with the
  // viseme stream (jawOpen). Placeholder-only — left behind on the GLB swap.
  const mouthPlane = useMemo(() => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.09, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x2b1512, side: THREE.DoubleSide })
    )
    m.position.set(0, -0.055, 0.163) // lower-front of the 0.17 sphere head
    m.scale.set(1, 0.15, 1)
    return m
  }, [])

  const tag = useMemo(() => nameSprite(label, accent), [label, accent])

  const rec = useMemo(() => ({
    id, group: null, headAnchor: null, head: headMesh,
    lipsync: null, accent, name: label,
    phase: rnd() * 6.28, kick: 0,
    home: new THREE.Vector3(position[0], 0, position[2]),
  }), [])

  // register hotspot (the visible meshes ARE the hit targets — no invisible proxies)
  // in an effect so unmount unregisters (stale entries break the gaze raycast)
  useEffect(() => {
    const unreg = registerInteractive({
      id, kind: 'hotspot', object3D: headMesh, radius: 0.66,
      onActivate: () => hq.director.onHotspot(id),
    })
    return () => {
      unreg()
      unregisterAvatar(id)
    }
  }, [id, headMesh, hq])

  // register avatar record once refs exist
  useFrame(() => {
    if (!rec.group && group.current) {
      rec.group = group.current
      rec.headAnchor = headAnchor.current
      rec.lipsync = new LipSyncEngine(headMesh)
      rec.lipsync.attachMouthPlane(mouthPlane)
      if (modelUrl) {
        // GLB upgrade path (async) — see lipsync.js attachGLTF.
        import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
          new GLTFLoader().load(modelUrl, (gltf) => {
            if (rec.lipsync.attachGLTF(gltf.scene)) {
              headMesh.visible = false
              mouthPlane.visible = false // GLB carries its own mouth/visemes
              group.current.add(gltf.scene)
            }
          })
        })
      }
      registerAvatar(id, rec)
    }
  })

  // idle life: ring pulse, talk bounce, head tracks gaze, Gary trembles
  useFrame((state, dt) => {
    if (!rec.group) return
    const t = state.clock.elapsedTime
    rec.kick = Math.max(0, rec.kick - dt * 2.2)
    const s = (1 + 0.06 * Math.sin(t * 3 + rec.phase)) * (1 + rec.kick * 0.5)
    if (ring.current) {
      ring.current.scale.set(s, s, 1)
      ring.current.material.opacity = 0.7 + 0.3 * Math.sin(t * 3 + rec.phase)
    }
    const gazed = hq.gaze.current && hq.gaze.current.id === id
    const targetYaw = gazed ? 0 : Math.sin(t * 0.4 + rec.phase) * 0.5
    headMesh.rotation.y += (targetYaw - headMesh.rotation.y) * Math.min(1, dt * 3)
    if (id === 'gary' && hq.director.state === 'voting' && !hq.director.returning) {
      rec.group.position.x = rec.home.x + Math.sin(t * 9) * 0.012 // nervous tremble
    }
    if (rec.lipsync) rec.lipsync.update(dt)
  })

  return (
    <group ref={group} position={position}>
      <mesh position={[0, 0.95, 0]} castShadow>
        <capsuleGeometry args={[0.23, 0.75, 6, 12]} />
        <primitive object={lambert(0x4a4238)} attach="material" />
      </mesh>
      <primitive object={headMesh} position={[0, 1.72, 0]} />
      <primitive object={mouthPlane} position={[0, 1.72, 0]} />
      <group ref={headAnchor} position={[0, 1.72, 0]} />
      <mesh ref={ring} position={[0, 1.35, 0]}>
        <torusGeometry args={[0.42, 0.035, 10, 40]} />
        <meshBasicMaterial color={accent} transparent opacity={0.8} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.4, 32]} />
        <meshBasicMaterial color={accent} transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>
      <primitive object={tag} position={[0, 2.14, 0]} />
    </group>
  )
}
