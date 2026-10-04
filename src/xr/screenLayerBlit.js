// screenLayerBlit — blits the documentary screen's canvas texture into an
// XR composition layer's render target (called from XRLayer customRender).
//
// Hoisted ortho scene + material: ZERO per-frame allocation (Task E).
// The canvas texture uploads to the GPU once; three only re-uploads when
// Screen.jsx sets needsUpdate (i.e. on card change).
import * as THREE from 'three'
import { hq } from '../hq.js'

const _scene = new THREE.Scene()
const _cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
const _mat = new THREE.MeshBasicMaterial({ toneMapped: false })
const _quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), _mat)
_quad.frustumCulled = false
_scene.add(_quad)

export function blitScreenToLayer(state) {
  const tex = hq.screen && hq.screen.texture
  if (!tex) return
  if (_mat.map !== tex) {
    _mat.map = tex
    _mat.needsUpdate = true
  }
  state.gl.render(_scene, _cam)
}
