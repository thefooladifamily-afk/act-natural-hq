// RATKManager — Meta's Reality Accelerator Toolkit (npm `ratk`, MIT) bound
// to the @react-three/xr-owned session via gl.xr.
//
// RealityAccelerator takes the three.js XRManager (renderer.xr) — it does
// NOT request its own session, so there is no session conflict with xrt.
// Per frame: ratk.update() syncs detected planes / room meshes / anchors /
// hit-test targets into ratk.root as Three.js Object3Ds.
import * as THREE from 'three'
import { RealityAccelerator } from 'ratk'
import { basic } from '../world/materials.js'

export class RATKManager {
  constructor() {
    this.ratk = null
    this.ready = false
    this.planeCount = 0
    this.meshCount = 0
    // Wireframe overlays are an MR-debug aid ("see the room being
    // understood"). They must NEVER appear in VR — Quest defect #2: Amy
    // saw these in immersive-vr. Default off; SceneUnderstanding enables
    // them only in AR mode.
    this.showOverlays = false
    this._hitTarget = null
  }

  init(xrManager, scene) {
    if (this.ready) return
    this.ratk = new RealityAccelerator(xrManager)
    scene.add(this.ratk.root)
    this.ratk.onPlaneAdded = (plane) => this._stylePlane(plane)
    this.ratk.onMeshAdded = (rmesh) => this._styleMesh(rmesh)
    this.ready = true
  }

  update() {
    if (this.ready && this.ratk) {
      try { this.ratk.update() } catch (e) { /* session not presenting yet */ }
    }
  }

  _stylePlane(plane) {
    this.planeCount++
    // Subtle wireframe so the visitor SEES the room being understood.
    // One shared material for all planes (no per-plane program cost).
    if (plane.planeMesh) {
      plane.planeMesh.material = basic(0x7fd8ff, {
        wireframe: true, transparent: true, opacity: 0.35,
      })
      plane.planeMesh.visible = this.showOverlays
      plane.userData.isDebugOverlay = true
    }
  }

  _styleMesh(rmesh) {
    this.meshCount++
    if (rmesh.meshMesh) {
      rmesh.meshMesh.material = basic(0xb48fff, {
        wireframe: true, transparent: true, opacity: 0.22,
      })
      rmesh.meshMesh.visible = this.showOverlays
      rmesh.userData.isDebugOverlay = true
    }
  }

  setOverlaysVisible(v) {
    this.showOverlays = v
    if (!this.ratk) return
    for (const p of this.ratk.planes || []) {
      if (p.planeMesh && p.userData.isDebugOverlay) p.planeMesh.visible = v
    }
    for (const m of this.ratk.meshes || []) {
      if (m.meshMesh && m.userData.isDebugOverlay) m.meshMesh.visible = v
    }
  }

  // Persistent anchors (Quest Browser cap: 8 per site).
  async restoreAnchors() {
    if (!this.ready) return []
    try {
      await this.ratk.restorePersistentAnchors()
      return [...this.ratk.anchors]
    } catch (e) { return [] }
  }

  async pinAnchor(position, quaternion) {
    if (!this.ready) return null
    try {
      return await this.ratk.createAnchor(position, quaternion, true)
    } catch (e) { return null }
  }

  // Viewer-space hit test: a ring that rides real-world surfaces in MR.
  // Called with no offsets: straight out of the viewer's forward axis.
  async viewerHitTarget() {
    if (!this.ready || this._hitTarget) return this._hitTarget
    try {
      this._hitTarget = await this.ratk.createHitTestTargetFromViewerSpace()
      return this._hitTarget
    } catch (e) { return null }
  }

  dispose(scene) {
    if (this.ratk && scene) {
      try { scene.remove(this.ratk.root) } catch (e) {}
    }
    this.ratk = null
    this.ready = false
    this._hitTarget = null
  }
}
