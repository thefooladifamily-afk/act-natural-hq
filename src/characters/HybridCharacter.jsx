// HybridCharacter — 3D toon body + v5 face card + UV-swapped mouth.
// QUEST SPEC DISCIPLINE (Amy's order 2026-10-02, specs apply project-wide):
//   - ONE 1024 atlas per character: body + face + 14 mouths share a single
//     1024x1024 texture (public/hybrid/atlas_{id}.png). KTX2/Basis at build.
//   - Draw calls: 2 (body mesh + face assembly). No ring mesh in hybrid.
//   - Triangles: Gary 19,820 / Marlow 25,596 (GLB index counts) + 4 card
//     tris — far under the 45K law.
//   - Materials: 2 per character, both MeshToonMaterial swapped at load
//     (body: 3-tone gradient; face: 1-tone white = exact approved colors).
//     Outlines are baked into the albedo; no runtime outline tricks.
//   - Morph targets: ZERO — the mouth is a UV-offset swap on one quad.
//
// Technique: the Guilty Gear Xrd trick — flat anime face art on a 3D head.
// The face assembly is ONE BufferGeometry (face quad + mouth quad 6mm in
// front), ONE material, ONE texture. Lip-sync rewrites 4 UVs per frame.
//
// Toggle: ?hybrid=1 (default OFF — the 2D billboards carry the build).
// Lip-sync: SpriteLipSync — the EXACT public surface VoiceEngine expects.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { registerAvatar, unregisterAvatar } from './avatarRegistry.js'
import { SpriteLipSync, MOUTH_NAMES } from './spriteLipsync.js'
import { registerInteractive } from '../interaction/interactives.js'
import { useHQ } from '../hq-context.jsx'

// Atlas layout (px, y-down). Source of truth: public/hybrid/atlas_meta.json.
// Body occupies UV v 0.25..1.0 (top 768 rows); face slot + 14 mouth cells
// share the bottom 256 rows.
const ATLAS = {
  gary: {
    glb: '/hybrid/gary.glb',
    atlas: '/hybrid/atlas_gary.png',
    head: [-0.7497, 1.6803, -0.0531], // head center, GLB mesh frame
    noseZ: 0.1239,
    headH: 0.2471,
    faceArt: [387, 540], // face art aspect (w,h)
    faceRect: [0, 767, 184, 1024],
    mouthUV: [0.5, 0.56],
    mouthWfrac: 0.62,
  },
  marlow: {
    glb: '/hybrid/marlow.glb',
    atlas: '/hybrid/atlas_marlow.png',
    head: [0.7503, 1.8049, 0.0473],
    noseZ: 0.1823,
    headH: 0.2422,
    faceArt: [390, 430],
    faceRect: [0, 794, 184, 997],
    mouthUV: [0.5, 0.71],
    mouthWfrac: 0.42,
  },
}
// Mouth cells: 7 cols x 2 rows of 120x84 at (184,768); MOUTH_NAMES order.
const MOUTH_CELL = { x0: 184, y0: 768, w: 120, h: 84, cols: 7 }
function mouthRect(name) {
  const i = MOUTH_NAMES.indexOf(name)
  const c = i % MOUTH_CELL.cols
  const r = Math.floor(i / MOUTH_CELL.cols)
  return [
    MOUTH_CELL.x0 + c * MOUTH_CELL.w,
    MOUTH_CELL.y0 + r * MOUTH_CELL.h,
    MOUTH_CELL.x0 + (c + 1) * MOUTH_CELL.w,
    MOUTH_CELL.y0 + (r + 1) * MOUTH_CELL.h,
  ]
}
const px2uv = (x, y) => [x / 1024, 1 - y / 1024]

// The seat (camera) the characters address. Matches App.jsx seated design.
const SEAT = [0, 1.2, 1.2]

function makeGradientMap(tones) {
  const data = new Uint8Array(tones.flatMap((t) => [t, t, t, 255]))
  const tex = new THREE.DataTexture(data, tones.length, 1, THREE.RGBAFormat)
  tex.needsUpdate = true
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  return tex
}

export default function HybridCharacter({ id, position, accent }) {
  const hq = useHQ()
  const group = useRef()
  const inner = useRef()
  const faceAssembly = useRef()
  const [model, setModel] = useState(null)
  const [atlas, setAtlas] = useState(null)
  const bodyMesh = useRef(null)

  const meta = ATLAS[id]
  const lipsync = useMemo(() => new SpriteLipSync(), [])
  const gradBody = useMemo(() => makeGradientMap([90, 160, 255]), [])
  const gradFace = useMemo(() => makeGradientMap([255]), []) // 1-tone: exact art colors

  const yaw = useMemo(
    () => Math.atan2(SEAT[0] - position[0], SEAT[2] - position[2]),
    [position]
  )

  // Load the GLB body; remap UVs into the atlas body region; toon-swap.
  useEffect(() => {
    let dead = false
    new GLTFLoader().load(
      meta.glb,
      (gltf) => {
        if (dead) return
        gltf.scene.traverse((o) => {
          if (o.isMesh) {
            o.frustumCulled = false
            const uv = o.geometry.attributes.uv
            if (uv) {
              for (let i = 0; i < uv.count; i++) {
                uv.setY(i, 0.25 + uv.getY(i) * 0.75) // body -> v 0.25..1.0
              }
              uv.needsUpdate = true
            }
            if (!bodyMesh.current) bodyMesh.current = o
          }
        })
        setModel(gltf.scene)
      },
      undefined,
      (e) => console.error('[hybrid] GLB load failed', id, e)
    )
    return () => { dead = true }
  }, [id, meta.glb])

  // Load the single 1024 atlas.
  useEffect(() => {
    let dead = false
    new THREE.TextureLoader().load(
      meta.atlas,
      (t) => {
        if (dead) return
        t.colorSpace = THREE.SRGBColorSpace
        t.anisotropy = 4
        setAtlas(t)
      },
      undefined,
      (e) => console.error('[hybrid] atlas load failed', id, e)
    )
    return () => { dead = true }
  }, [id, meta.atlas])

  // Toon-swap the body material once the atlas is in.
  useEffect(() => {
    if (!model || !atlas || !bodyMesh.current) return
    const m = bodyMesh.current
    m.material = new THREE.MeshToonMaterial({ map: atlas, gradientMap: gradBody })
  }, [model, atlas, gradBody])

  // Recenter (feet at group origin) + face-assembly geometry (2 quads, 1 mesh).
  const layout = useMemo(() => {
    if (!model) return null
    const box = new THREE.Box3().setFromObject(model)
    const c = box.getCenter(new THREE.Vector3())
    const shift = new THREE.Vector3(-c.x, -box.min.y, -c.z)
    const head = new THREE.Vector3(...meta.head).add(shift)
    const faceZ = meta.noseZ + shift.z + 0.012
    const cardH = meta.headH * 1.15
    const cardW = cardH * (meta.faceArt[0] / meta.faceArt[1])
    const [mu, mv] = meta.mouthUV
    const mouthW = cardW * meta.mouthWfrac
    const mouthH = mouthW * (MOUTH_CELL.h / MOUTH_CELL.w)
    const mx = head.x + (mu - 0.5) * cardW
    const my = head.y + (0.5 - mv) * cardH

    // Quad verts: face (0-3), mouth (4-7). Mouth rides 6mm in front.
    const hw = cardW / 2
    const hh = cardH / 2
    const mw = mouthW / 2
    const mh = mouthH / 2
    const pos = new Float32Array([
      head.x - hw, head.y - hh, faceZ, // 0 BL
      head.x + hw, head.y - hh, faceZ, // 1 BR
      head.x + hw, head.y + hh, faceZ, // 2 TR
      head.x - hw, head.y + hh, faceZ, // 3 TL
      mx - mw, my - mh, faceZ + 0.006, // 4 BL
      mx + mw, my - mh, faceZ + 0.006, // 5 BR
      mx + mw, my + mh, faceZ + 0.006, // 6 TR
      mx - mw, my + mh, faceZ + 0.006, // 7 TL
    ])
    const [fx0, fy0, fx1, fy1] = meta.faceRect
    const [fu0, fvT] = px2uv(fx0, fy0)
    const [fu1, fvB] = px2uv(fx1, fy1)
    const uv = new Float32Array([
      fu0, fvB, fu1, fvB, fu1, fvT, fu0, fvT, // face quad
      0, 0, 0, 0, 0, 0, 0, 0, // mouth quad (set per frame)
    ])
    const idx = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeVertexNormals()
    return { shift, geometry: g }
  }, [model, meta])

  // Per-frame mouth UV swap (the actual spec technique).
  const setMouthUV = (name) => {
    const mesh = faceAssembly.current
    if (!mesh) return
    const [x0, y0, x1, y1] = mouthRect(name)
    const [u0, vT] = px2uv(x0, y0)
    const [u1, vB] = px2uv(x1, y1)
    const uv = mesh.geometry.attributes.uv
    // verts 4..7 = BL,BR,TR,TL
    uv.setXY(4, u0, vB)
    uv.setXY(5, u1, vB)
    uv.setXY(6, u1, vT)
    uv.setXY(7, u0, vT)
    uv.needsUpdate = true
  }

  const rec = useMemo(
    () => ({
      id,
      group: null,
      headAnchor: null,
      head: null,
      lipsync,
      accent,
      name: id.toUpperCase(),
      phase: Math.random() * 6.28,
      kick: 0,
      home: new THREE.Vector3(position[0], 0, position[2]),
    }),
    [id, lipsync, accent, position]
  )

  useEffect(() => {
    if (!model || !layout || !faceAssembly.current) return
    setMouthUV('Neutral')
    const unreg = registerInteractive({
      id,
      kind: 'hotspot',
      object3D: bodyMesh.current || faceAssembly.current,
      radius: 0.7,
      onActivate: () => hq.director.onHotspot(id),
    })
    rec.group = group.current
    rec.headAnchor = faceAssembly.current
    registerAvatar(id, rec)
    return () => {
      unreg()
      unregisterAvatar(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, model, layout])

  const _shown = useRef('Neutral')

  useFrame((state, dt) => {
    if (!inner.current || !layout) return
    const t = state.clock.elapsedTime
    rec.kick = Math.max(0, rec.kick - dt * 2.2)
    const s = (1 + 0.02 * Math.sin(t * 2 + rec.phase)) * (1 + rec.kick * 0.4)
    inner.current.scale.set(s, s, s)
    const talking = lipsync.talking
    inner.current.position.y =
      layout.shift.y +
      (talking ? Math.abs(Math.sin(t * 9)) * 0.012 * Math.min(1, lipsync.energy + 0.3) : 0)
    if (id === 'gary' && hq.director.state === 'voting' && !hq.director.returning) {
      group.current.position.x = rec.home.x + Math.sin(t * 9) * 0.012
    } else {
      group.current.position.x = rec.home.x
    }
    lipsync.update(dt)
    const want = lipsync.currentMouth || 'Neutral'
    if (want !== _shown.current) {
      setMouthUV(want)
      _shown.current = want
    }
  })

  if (!model || !atlas || !layout) return null

  return (
    <group ref={group} position={position} rotation={[0, yaw, 0]}>
      <group ref={inner} position={layout.shift.toArray()}>
        <primitive object={model} />
        {/* Face assembly: v5 face quad + UV-swapped mouth quad, 1 draw call */}
        <mesh ref={faceAssembly} geometry={layout.geometry}>
          <meshToonMaterial map={atlas} gradientMap={gradFace} alphaTest={0.4} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  )
}
