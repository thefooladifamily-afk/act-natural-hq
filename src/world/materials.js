// Shared materials — dedupe keeps draw calls and program switches down.
// Lambert/basic only. No PBR, no post-processing (perf law).
import * as THREE from 'three'

const cache = new Map()

export function lambert(color, emissive = 0x000000, emissiveIntensity = 0) {
  const key = `l:${color}:${emissive}:${emissiveIntensity}`
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity }))
  }
  return cache.get(key)
}

export function basic(color, opts = {}) {
  const key = `b:${color}:${JSON.stringify(opts)}`
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshBasicMaterial({ color, ...opts }))
  }
  return cache.get(key)
}

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

// Deterministic pseudo-random so the meadow is the same meadow every visit.
let _seed = 1234567
export function rnd() {
  _seed = (_seed * 16807) % 2147483647
  return (_seed - 1) / 2147483646
}
export function reseed(s) { _seed = s }
