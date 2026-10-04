// CaptionCard — in-world captions as proscenium supertitles.
//
// Was: a 2.6m black plane billboarding in mid-air (read as a floating black
// plane bug). Now: a fixed dark-bronze plaque with a gold border, mounted
// flush on the proscenium base below the screen — opera-supertitle style.
// It reads as part of the architecture whether or not a caption is showing.
//
// In XR there is no DOM subtitle bar, so dialogue captions live here. The
// texture is redrawn imperatively when VoiceEngine emits a caption (no React
// re-render in the hot path). The caption SYSTEM is untouched — only the
// presentation changed.
import { useEffect, useRef } from 'react'
import { canvasTexture } from './materials.js'
import { hq } from '../hq.js'

const W = 1024, H = 208

function drawPlaque(g, speaker, accent, text, visible) {
  // The plaque itself is always drawn — architecture, not a popup.
  g.fillStyle = '#241c12'; g.fillRect(0, 0, W, H)
  g.strokeStyle = '#c9a227'; g.lineWidth = 6; g.strokeRect(10, 10, W - 20, H - 20)
  g.strokeStyle = '#6b5a2e'; g.lineWidth = 2; g.strokeRect(22, 22, W - 44, H - 44)
  if (!visible || !text) return
  g.textAlign = 'center'
  g.fillStyle = accent || '#c9a227'; g.font = 'bold 38px sans-serif'
  g.fillText(speaker, W / 2, 66)
  g.fillStyle = '#fdf6e3'; g.font = '36px sans-serif'
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const wd of words) {
    const test = line ? line + ' ' + wd : wd
    if (g.measureText(test).width > W - 120 && line) { lines.push(line); line = wd }
    else line = test
  }
  if (line) lines.push(line)
  lines.slice(0, 2).forEach((ln, i) => g.fillText(ln, W / 2, 126 + i * 44))
}

export default function CaptionCard({ position = [0, 0.62, -1.51] }) {
  const mesh = useRef()
  const texRef = useRef()

  useEffect(() => {
    const tex = canvasTexture(W, H, (g) => drawPlaque(g))
    texRef.current = tex
    if (mesh.current) mesh.current.material.map = tex
    const unsub = hq.voice.onCaption(({ speaker, accent, text, visible }) => {
      const t = texRef.current
      if (!t) return
      drawPlaque(t.image.getContext('2d'), speaker, accent, text, visible)
      t.needsUpdate = true
    })
    return () => unsub()
  }, [])

  return (
    <mesh ref={mesh} position={position}>
      <planeGeometry args={[2.0, 0.41]} />
      <meshBasicMaterial toneMapped={false} />
    </mesh>
  )
}
