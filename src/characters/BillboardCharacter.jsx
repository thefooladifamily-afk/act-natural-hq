// BillboardCharacter — 2D puppet in the 3D Screening Room.
//
// Amy's decision 2026-10-02: 2D puppets carry the build while the 3D sculpts
// continue in parallel. Each character is a yaw-billboarded group:
//
//   body plane  (PSD composite, alphaTest cutout)      — 1 draw call
//   mouth plane (14 swappable CA mouth sprites)        — 1 draw call
//   floor ring  (gaze hotspot affordance)              — 1 draw call
//
// Lip-sync: SpriteLipSync has the EXACT public surface VoiceEngine expects
// (speakText/setCharIndex/stopText/attachAnalyser/detachAnalyser/
// setTalking/update) — voice.js needed zero changes. When the GLB sculpts
// land, this component swaps out; the pipeline doesn't.
//
// Perf law: alphaTest cutout (no transparent sorting, depthWrite stays on),
// 1024px-max body texture, small mouth sprites.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { registerAvatar, unregisterAvatar } from './avatarRegistry.js'
import { SpriteLipSync, MOUTH_NAMES } from './spriteLipsync.js'
import { registerInteractive } from '../interaction/interactives.js'
import { useFocusGlow } from '../interaction/useFocusGlow.js'
import { useHQ } from '../hq-context.jsx'

const HEIGHTS = { gary: 1.78, marlow: 1.68 }

export default function BillboardCharacter({ id, position, accent }) {
  const hq = useHQ()
  const camera = useThree((s) => s.camera)
  const group = useRef()
  const mouthMesh = useRef()
  const ring = useRef()
  const [assets, setAssets] = useState(null)

  const height = HEIGHTS[id] || 1.72
  const lipsync = useMemo(() => new SpriteLipSync(), [])

  // Load manifest + textures once.
  useEffect(() => {
    let dead = false
    const loader = new THREE.TextureLoader()
    const load = (url) => new Promise((res, rej) => {
      loader.load(url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace
        t.anisotropy = 4
        res(t)
      }, undefined, rej)
    })
    ;(async () => {
      const man = await (await fetch(`./sprites/${id}/manifest.json`)).json()
      const body = await load(`./sprites/${id}/${man.body.file}`)
      // QUEST SPEC: ONE mouth atlas per character, uploaded once. Visemes are
      // UV-rect swaps on the shared geometry — no texture rebinds, no uploads.
      const atlas = await load(`./sprites/${id}/${man.mouthAtlas.file}`)
      if (!dead) setAssets({ man, body, atlas })
    })().catch((e) => console.error('[billboard] asset load failed', id, e))
    return () => { dead = true }
  }, [id])

  const geom = useMemo(() => {
    if (!assets) return null
    const { man } = assets
    const W = height * (man.body.w / man.body.h)
    const H = height
    const body = { W, H }
    const mouths = {}
    for (const name of MOUTH_NAMES) {
      const e = man.mouths[name]
      if (!e) continue
      mouths[name] = {
        w: e.w * W,
        h: e.h * H,
        x: (e.cx - 0.5) * W,
        y: (0.5 - e.cy) * H,
      }
    }
    return { body, mouths }
  }, [assets, height])

  const rec = useMemo(() => ({
    id, group: null, headAnchor: null, head: null,
    lipsync, accent, name: id.toUpperCase(),
    phase: Math.random() * 6.28, kick: 0,
    home: new THREE.Vector3(position[0], 0, position[2]),
  }), [id, lipsync, accent, position])

  // hotspot + avatar registration (after meshes exist)
  const bodyMesh = useRef()
  const hotspotRec = useMemo(() => ({
    id, kind: 'hotspot', object3D: null, radius: 0.7,
    onActivate: () => hq.director.onHotspot(id),
  }), [id, hq])
  useEffect(() => {
    if (!assets || !bodyMesh.current) return
    hotspotRec.object3D = bodyMesh.current
    const unreg = registerInteractive(hotspotRec)
    rec.group = group.current
    rec.headAnchor = bodyMesh.current
    registerAvatar(id, rec)
    return () => {
      unreg()
      unregisterAvatar(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, assets])
  // Gaze focus: the floor ring brightens when looked at. Characters keep
  // their short ids — the avatar registry + Director.onHotspot match on them.
  const focusWrapper = useMemo(() => ({ r: hotspotRec }), [hotspotRec])
  useFocusGlow(focusWrapper, ring, { brightness: 1.6, scale: 1.12 })

  const _euler = useMemo(() => new THREE.Euler(), [])
  const _shown = useRef(null) // null forces the first frame to write Neutral's UVs

  useFrame((state, dt) => {
    if (!group.current || !assets) return
    const t = state.clock.elapsedTime
    // Yaw-only billboard: face the camera, never tilt.
    _euler.setFromQuaternion(camera.quaternion, 'YXZ')
    group.current.rotation.y = _euler.y
    // Idle life: breathing scale + talk bounce + ring pulse.
    rec.kick = Math.max(0, rec.kick - dt * 2.2)
    const s = (1 + 0.02 * Math.sin(t * 2 + rec.phase)) * (1 + rec.kick * 0.4)
    group.current.scale.set(s, s, 1)
    const talking = lipsync.talking
    group.current.position.y = talking
      ? Math.abs(Math.sin(t * 9)) * 0.012 * Math.min(1, lipsync.energy + 0.3)
      : 0
    if (id === 'gary' && hq.director.state === 'voting' && !hq.director.returning) {
      group.current.position.x = rec.home.x + Math.sin(t * 9) * 0.012 // nervous tremble
    } else {
      group.current.position.x = rec.home.x
    }
    if (ring.current) {
      ring.current.material.opacity = 0.45 + 0.25 * Math.sin(t * 3 + rec.phase)
    }
    // Drive + UV-swap the mouth on the atlas (UV rect only — the texture is
    // uploaded once at load; a viseme change re-uploads 4 verts, never pixels).
    lipsync.update(dt)
    const want = lipsync.currentMouth || 'Neutral'
    if (want !== _shown.current && mouthMesh.current) {
      const entry = assets.man.mouths[want]
      if (entry) {
        const uv = mouthMesh.current.geometry.attributes.uv
        const [u0, v0, u1, v1] = entry.uv
        // PlaneGeometry vertex order: (0,1), (1,1), (0,0), (1,0)
        uv.setXY(0, u0, v1); uv.setXY(1, u1, v1)
        uv.setXY(2, u0, v0); uv.setXY(3, u1, v0)
        uv.needsUpdate = true
        _shown.current = want
      }
    }
  })

  if (!assets || !geom) return null
  const { body, mouths } = geom
  const m0 = mouths['Neutral']

  return (
    <group ref={group} position={position} name={`screeningRoom.character.${id}`}>
      <mesh ref={bodyMesh} position={[0, body.H / 2, 0]} name={`screeningRoom.character.${id}.body`}>
        <planeGeometry args={[body.W, body.H]} />
        <meshBasicMaterial map={assets.body} alphaTest={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={mouthMesh} position={[m0.x, body.H / 2 + m0.y, 0.004]}>
        <planeGeometry args={[m0.w, m0.h]} />
        <meshBasicMaterial
          map={assets.atlas}
          alphaTest={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={ring} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.5, 40]} />
        {/* NOTE: FrontSide only — DoubleSide+transparent costs 2 draw calls in three.js */}
        <meshBasicMaterial color={accent} transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </group>
  )
}
