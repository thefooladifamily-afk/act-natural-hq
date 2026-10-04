// LastPickBoard — "last night's pick" continuity board + MR anchor demo.
// Carried over from hq-v3.
//
// Shows the winning stunt from the visitor's previous visit (localStorage).
// In MR, the Director pins a PERSISTENT RATK anchor here on first run;
// on later visits the board re-seats itself onto the restored anchor — the
// "HQ remembers where it lives in your room" beat for the competition demo.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { canvasTexture } from './materials.js'
import { hq } from '../hq.js'
import { store } from '../state/store.js'

const TITLES = { swing: 'THE SWING SCENE', chime: 'CHIME CHAOS', cats: 'CAT COUP' }

export default function LastPickBoard({ position = [-2.86, 1.5, -0.5], rotation = [0, Math.PI / 2, 0], fixed = true }) {
  const group = useRef()

  const faceTex = useMemo(() => {
    const pick = store.data.lastPick
    return canvasTexture(512, 320, (g, w, h) => {
      g.fillStyle = '#2e2418'; g.fillRect(0, 0, w, h)
      g.strokeStyle = '#c9a86a'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16)
      g.textAlign = 'center'
      g.fillStyle = '#c9a86a'; g.font = 'bold 40px sans-serif'
      g.fillText("LAST NIGHT'S PICK", w / 2, 70)
      g.fillStyle = '#f6efdd'; g.font = 'bold 54px sans-serif'
      g.fillText(pick ? TITLES[pick] || pick : '— first visit —', w / 2, 160)
      g.font = '32px sans-serif'; g.fillStyle = '#a89878'
      g.fillText(pick ? 'the meadow remembers' : 'come back tomorrow', w / 2, 230)
    })
  }, [])

  // MR: pin a persistent anchor at the board on first AR session; reseat on restore.
  useEffect(() => {
    let cancelled = false
    const t = setInterval(async () => {
      if (cancelled) return
      if (hq.session.mode === 'ar' && hq.ratk && hq.ratk.ready && group.current) {
        clearInterval(t)
        const anchors = await hq.ratk.restoreAnchors().catch(() => [])
        const mine = anchors.find((a) => a && a.userData && a.userData.hqBoard)
        if (mine) {
          // Reseat the board onto the restored anchor.
          mine.add(group.current)
          group.current.position.set(0, 0, 0)
          group.current.rotation.set(0, 0, 0)
        } else if (hq.ratk.ratk) {
          const p = new THREE.Vector3()
          const q = new THREE.Quaternion()
          group.current.getWorldPosition(p)
          group.current.getWorldQuaternion(q)
          const anchor = await hq.ratk.pinAnchor(p, q).catch(() => null)
          if (anchor) anchor.userData.hqBoard = true
        }
      }
    }, 1500)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  useFrame((state) => {
    // Wall-mounted boards (fixed) don't billboard — they're architecture.
    if (fixed) return
    if (group.current && !group.current.parent.isAnchor) {
      group.current.lookAt(state.camera.position.x, 1.25, state.camera.position.z)
    }
  })

  return (
    <group ref={group} position={position} rotation={rotation}>
      {/* gold frame */}
      <mesh position={[0, 0, -0.025]}>
        <boxGeometry args={[1.47, 0.97, 0.05]} />
        <meshLambertMaterial color={0xc9a227} emissive={0x6b4e12} emissiveIntensity={0.35} />
      </mesh>
      <mesh>
        <boxGeometry args={[1.35, 0.85, 0.07]} />
        <meshBasicMaterial map={faceTex} />
      </mesh>
    </group>
  )
}
