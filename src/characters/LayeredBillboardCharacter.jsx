// LayeredBillboardCharacter — 3-depth-layer 2D puppet in the 3D Screening Room.
//
// Same public contract as BillboardCharacter (drop-in replacement):
//   props id / position / accent, avatarRegistry rec shape, hotspot,
//   SpriteLipSync surface, floor ring, yaw-billboard idle life.
//
// The difference: instead of one composite body plane, the sprite arrives as
// three depth-separated layers (layers.json per character):
//
//   layer-body.png  (torso + legs)          z = 0.000 — 1 draw call
//   layer-arms.png  (arms, in FRONT of body) z = 0.025 — 1 draw call
//   layer-head.png  (head, in FRONT of arms) z = 0.050 — 1 draw call
//   mouth plane     (UV-swapped atlas)      z = mouthZ (0.054) — 1 draw call
//   floor ring      (gaze hotspot affordance) — 1 draw call
//
// The 25mm/50mm separations are real parallax: camera moves (VR head sway,
// gaze track) shift the layers against each other, selling depth without a
// 3D sculpt. The head layer gets a tiny independent counter-bob so the
// parallax breathes even when the camera is still.
//
// Perf law (same as BillboardCharacter): alphaTest cutout on every plane
// (no transparent sorting, depthWrite stays on — depth ordering resolves
// the layers automatically), 1024px-max textures, mouth atlas uploaded once
// with UV-rect swaps only.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { registerAvatar, unregisterAvatar } from './avatarRegistry.js'
import { SpriteLipSync, MOUTH_NAMES } from './spriteLipsync.js'
import { registerInteractive } from '../interaction/interactives.js'
import { useFocusGlow } from '../interaction/useFocusGlow.js'
import { useHQ } from '../hq-context.jsx'

const HEIGHTS = { gary: 1.78, marlow: 1.68 }

// Fallback if layers.json is missing — matches the authored spec values.
const LAYER_DEFAULTS = { body: 0.0, arms: 0.025, head: 0.05, mouthZ: 0.054 }

export default function LayeredBillboardCharacter({ id, position, accent }) {
  const hq = useHQ()
  const camera = useThree((s) => s.camera)
  const group = useRef()
  const mouthMesh = useRef()
  const headMesh = useRef()
  const ring = useRef()
  const [assets, setAssets] = useState(null)

  const height = HEIGHTS[id] || 1.72
  const lipsync = useMemo(() => new SpriteLipSync(), [])

  // Load layers.json + manifest + textures once.
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
      let layers = LAYER_DEFAULTS
      try {
        const spec = await (await fetch(`./sprites/${id}/layers.json`)).json()
        layers = {
          body: spec.layers.find((l) => l.file.includes('body'))?.z ?? LAYER_DEFAULTS.body,
          arms: spec.layers.find((l) => l.file.includes('arms'))?.z ?? LAYER_DEFAULTS.arms,
          head: spec.layers.find((l) => l.file.includes('head'))?.z ?? LAYER_DEFAULTS.head,
          mouthZ: spec.mouthZ ?? LAYER_DEFAULTS.mouthZ,
          // head layer rest position (Y center of the plane) for the counter-bob
          headH: height / 2,
        }
      } catch (e) {
        console.warn('[layered-billboard] layers.json missing for', id, '— using defaults')
      }
      // QUEST SPEC: ONE mouth atlas per character, uploaded once. Visemes are
      // UV-rect swaps on the shared geometry — no texture rebinds, no uploads.
      const files = ['layer-body.png', 'layer-arms.png', 'layer-head.png']
      const [body, arms, head, atlas] = await Promise.all([
        ...files.map((f) => load(`./sprites/${id}/${f}`)),
        load(`./sprites/${id}/${man.mouthAtlas.file}`),
      ])
      if (!dead) setAssets({ man, body, arms, head, atlas, layers })
    })().catch((e) => console.error('[layered-billboard] asset load failed', id, e))
    return () => { dead = true }
  }, [id])

  const geom = useMemo(() => {
    if (!assets) return null
    const { man, layers } = assets
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
    return { body, mouths, layers }
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
    if (!assets || !bodyMesh.current || !headMesh.current) return
    hotspotRec.object3D = bodyMesh.current
    const unreg = registerInteractive(hotspotRec)
    rec.group = group.current
    // The head layer is a real mesh now — positional audio (voice.js)
    // anchors to the head instead of the body center.
    rec.headAnchor = headMesh.current
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
    // Head-layer counter-bob: sells the depth separation even when the
    // camera is still. 2mm — enough to read as parallax, never as drift.
    if (headMesh.current) {
      headMesh.current.position.y = assets.layers.headH
        + 0.002 * Math.sin(t * 2 + rec.phase + Math.PI)
        + (talking ? 0.001 * Math.sin(t * 9) : 0)
    }
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
  const { body, mouths, layers } = geom
  const m0 = mouths['Neutral']
  const baseY = body.H / 2

  return (
    <group ref={group} position={position} name={`screeningRoom.character.${id}`}>
      <mesh ref={bodyMesh} position={[0, baseY, layers.body]} name={`screeningRoom.character.${id}.layer-body`}>
        <planeGeometry args={[body.W, body.H]} />
        <meshBasicMaterial map={assets.body} alphaTest={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, baseY, layers.arms]} name={`screeningRoom.character.${id}.layer-arms`}>
        <planeGeometry args={[body.W, body.H]} />
        <meshBasicMaterial map={assets.arms} alphaTest={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={headMesh} position={[0, baseY, layers.head]} name={`screeningRoom.character.${id}.layer-head`}>
        <planeGeometry args={[body.W, body.H]} />
        <meshBasicMaterial map={assets.head} alphaTest={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={mouthMesh} position={[m0.x, baseY + m0.y, layers.mouthZ]} name={`screeningRoom.character.${id}.mouth`}>
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
