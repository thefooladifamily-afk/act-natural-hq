// App — The Screening Room shell.
//
// Wiring order (matters):
//   HQProvider > Canvas > XRSession > SceneUnderstanding (RATK) + world +
//   characters + interaction + audio bootstrap + director tick.
// The DOM overlay (intro/HUD/endcard) lives outside the Canvas — it only
// exists when no XR session is presenting.
import { useEffect, useMemo, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { HQProvider } from './hq-context.jsx'
import { hq } from './hq.js'
import { store } from './state/store.js'
import { Director } from './director/Director.js'
import XRSession from './xr/XRSession.jsx'
import { enterVR, enterMR } from './xr/store.js'
import SceneUnderstanding, { MRToggle3D } from './xr/SceneUnderstanding.jsx'
import HitReticle from './xr/HitReticle.jsx'
import Meadow from './world/Meadow.jsx'
import VoteCards from './world/VoteCards.jsx'
import PortalTransition from './world/PortalTransition.jsx'
import ExitSign from './world/ExitSign.jsx'
import LastPickBoard from './world/LastPickBoard.jsx'
import CaptionCard from './world/CaptionCard.jsx'
import Screen from './world/Screen.jsx'
import Seat from './world/Seat.jsx'
import Proscenium from './world/Proscenium.jsx'
import TheaterSet from './world/TheaterSet.jsx'
import ProjectorBeam from './world/ProjectorBeam.jsx'
import TalkConsole from './world/TalkConsole.jsx'
import FamousButton from './world/FamousButton.jsx'
import BillboardCharacter from './characters/BillboardCharacter.jsx'
import LayeredBillboardCharacter from './characters/LayeredBillboardCharacter.jsx'
import HybridCharacter from './characters/HybridCharacter.jsx'
import GazeDwell from './interaction/GazeDwell.jsx'
import DesktopControls from './interaction/DesktopControls.jsx'
import HandCursors from './interaction/HandCursors.jsx'
import PerfHUD from './perf/PerfHUD.jsx'
import InSceneHUD from './perf/InSceneHUD.jsx'
import GovernorTick from './perf/GovernorTick.jsx'
import GazeTrack from './world/GazeTrack.jsx'
import PhysicalCard from './world/PhysicalCard.jsx'
import EngineBridge from './engine/EngineBridge.jsx'
import { clampDt } from './perf/pools.js'

// TASK G — CAPTURE MODE: ?clean=1 hides ALL dev HUD (director bar, visit/
// vote counters, debug overlays, perf HUD) for the Nov 8 trailer shoot.
// The scene plays identically — only the overlays go.
export const CLEAN =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('clean')
import BlobShadows from './world/BlobShadows.jsx'
import { Intro, Hud, EndCard } from './ui/Overlay.jsx'
import MobileVoteUI from './ui/MobileVoteUI.jsx'
import MobileTalkUI from './ui/MobileTalkUI.jsx'
import JudgeMode from './debug/JudgeMode.jsx'

// Hybrid 3D track toggle: ?hybrid=1 renders the 3D toon bodies with v5 face
// cards instead of the 2D billboards. Default off — 2D carries the build.
// Layered 2D track toggle: ?layered=1 renders the depth-separated
// body/arms/head layers (layered-billboard path) instead of the single
// composite billboard. Default off until Amy approves the layered art.
const USE_HYBRID_3D =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('hybrid') === '1'
const USE_LAYERED_2D =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('layered') === '1'

function AudioBootstrap() {
  const camera = useThree((s) => s.camera)
  useEffect(() => { hq.voice.init(camera) }, [camera])
  return null
}

// Passthrough needs a transparent clear; VR needs opaque sky.
function ClearAlpha() {
  const gl = useThree((s) => s.gl)
  useFrame(() => {
    gl.setClearColor(0x000000, hq.session.mode === 'ar' ? 0 : 1)
  })
  return null
}

function DirectorTick() {
  useFrame((state, rawDt) => {
    const dt = clampDt(rawDt) // one canonical clamp: no spiral of death
    if (hq.director) hq.director.tick(dt)
    hq.ambience.tick(state.clock.elapsedTime)
  })
  return null
}

function Scene() {
  const scene = useThree((s) => s.scene)
  useEffect(() => { hq.scene = scene; return () => { if (hq.scene === scene) hq.scene = null } }, [scene])
  return (
    <XRSession>
      <SceneUnderstanding />
      <ClearAlpha />
      <AudioBootstrap />
      <color attach="background" args={['#0e1a26']} />
      <fog attach="fog" args={['#f2c98f', 45, 120]} />
      <Meadow />
      <Screen />
      <Proscenium />
      <TheaterSet />
      <ProjectorBeam />
      <Seat />
      {/* 2D puppets (Amy 2026-10-02): approved PSD art billboards carry the
          build while 3D sculpts continue in parallel. Theater blocking
          (blueprint §17/§18, Amy 2026-10-03): Gary and Marlow flank the
          proscenium as stage hosts — wide enough to never occlude the
          screen, the boards, or the visitor's sightline.
          ?hybrid=1 swaps in the hybrid 3D track (toon GLB bodies + v5 face
          cards + mouth-swap lip-sync) without touching the 2D path.
          ?layered=1 swaps in the layered 2D track (body/arms/head planes at
          0/25/50mm depth + mouth at 54mm) — same pipeline, parallax life. */}
      {USE_HYBRID_3D ? (
        <>
          <HybridCharacter id="gary" position={[-2.3, 0, -0.7]} accent="#ffb347" />
          <HybridCharacter id="marlow" position={[2.3, 0, -0.7]} accent="#ff8fa3" />
        </>
      ) : USE_LAYERED_2D ? (
        <>
          <LayeredBillboardCharacter id="gary" position={[-2.3, 0, -0.7]} accent="#ffb347" />
          <LayeredBillboardCharacter id="marlow" position={[2.3, 0, -0.7]} accent="#ff8fa3" />
        </>
      ) : (
        <>
          <BillboardCharacter id="gary" position={[-2.3, 0, -0.7]} accent="#ffb347" />
          <BillboardCharacter id="marlow" position={[2.3, 0, -0.7]} accent="#ff8fa3" />
        </>
      )}
      {/* Task F magic, mounted AFTER the characters so GazeTrack's useFrame
          runs after theirs (it leans the groups toward the visitor).
          PhysicalCard is Marlow's cue card for the recut beat. */}
      <GazeTrack />
      <PhysicalCard />
      <VoteCards />
      <PortalTransition />
      <TalkConsole />
      {/* in-headset 3D Famous button (Amy 2026-10-03): pinchable gold
          pedestal button wired to hq.voice.performFamous() */}
      <FamousButton />
      <BlobShadows />{/* governor L5 fallback — hidden until shadows die */}
      {/* hands-first: EXIT floats right of the seat, inside the reach volume */}
      <ExitSign position={[-2.7, 1.5, 3.05]} />
      <LastPickBoard />
      <CaptionCard position={[0, 0.62, -1.51]} />
      {/* hands-first: MR toggle floats left of the seat, inside the reach volume */}
      <MRToggle3D position={[-0.5, 1.25, 0.9]} />
      <HitReticle />
      <GazeDwell />
      <DesktopControls />
      <HandCursors />
      <DirectorTick />
      <EngineBridge />{/* Behavioral Cinema Engine: event bus + session memory
        + behavior states + director responses. No visuals, no per-frame cost. */}
      {/* fixed update order: input -> logic (DirectorTick) -> governor ->
          animation -> render. GovernorTick observes the clamped delta and
          steps the degradation ladder; it allocates nothing. */}
      <GovernorTick />
      <InSceneHUD />{/* ?perf=1: the in-headset budget readout */}
    </XRSession>
  )
}

// Greybox debug handle: the IWER verification harness drives the loop
// through this (window.__hq.director, window.__hq.voice, ...).
// window.__hq.qa.run() executes the automated end-to-end checklist
// (src/qa/checklist.js) — flat mode, after entering via PREVIEW.
import { runQA } from './qa/checklist.js'
import { getInteractives } from './interaction/interactives.js'
if (typeof window !== 'undefined') {
  window.__hq = hq
  window.__hq.qa = {
    // Flat mode only: enter via PREVIEW (NO HEADSET), then run.
    run: () => {
      const sc = hq.scene || null
      if (!sc) {
        console.error('[qa] FAIL abort — three.js scene not ready. Enter via PREVIEW (NO HEADSET) first, then run window.__hq.qa.run().')
        return Promise.resolve({ ok: 0, failed: ['abort'], skipped: 0, results: [] })
      }
      return runQA(hq, sc)
    },
    interactives: () => getInteractives().map((i) => ({ id: i.id, kind: i.kind })),
  }
}

export default function App() {
  const [entered, setEntered] = useState(false)
  const [endInfo, setEndInfo] = useState(null)
  const [err, setErr] = useState('')

  const director = useMemo(() => {
    const d = new Director()
    hq.director = d
    return d
  }, [])

  useEffect(() => {
    hq.overlay.showEnd = (choice, title, finale) => {
      setEndInfo({ choice, title, finale })
      setEntered(false)
    }
    return () => { hq.overlay.showEnd = null }
  }, [])

  async function onEnter(mode) {
    setErr('')
    setEndInfo(null)
    try {
      // User gesture: start procedural audio here (autoplay policy).
      hq.ambience.start()
      hq.ambience.resume()
      hq.voice.resume()
      // SPATIAL: pin the wind-chime plucks to the 3D chime location.
      hq.ambience.spatializeChimes(null, new THREE.Vector3(2.3, 2.9, -3.1))
      if (mode === 'vr') await enterVR()
      else if (mode === 'ar') await enterMR()
      // 'flat': no XR session — the loop runs on the flat page (judging
      // floor). VoiceEngine.presenting stays false so the TTS stub runs.
      setEntered(true)
      store.data.visits = (store.data.visits || 0) + 1
      store.data.lastVisit = store.today()
      store.save()
      director.start()
    } catch (e) {
      setErr(
        'Could not start the XR session' + (e && e.message ? ': ' + e.message : '') +
        '. On Quest, open the https:// address (npm run dev:https) — WebXR needs a secure context.'
      )
    }
  }

  return (
    <HQProvider>
      <Canvas
        shadows
        dpr={[1, 1.5]}               // perf law: pixel ratio ≤1.5
        // SEATED DESIGN: camera at the chair — eye height 1.2m, z=1.2.
        // (In XR the headset pose takes over; this is the seated reference.)
        camera={{ fov: 70, near: 0.1, far: 400, position: [0, 1.2, 1.2] }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl, camera }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.1
          gl.shadowMap.type = THREE.PCFShadowMap // cheap shadows (perf law)
          camera.lookAt(0, 1.35, -1.6) // spawn faces the screen + window + meadow
        }}
      >
        <Scene />
      </Canvas>
      {!entered && !endInfo && <Intro onEnter={onEnter} err={err} />}
      {entered && !CLEAN && <Hud />}{/* ?clean=1: no director bar for capture */}
      {entered && <MobileVoteUI />}
      {entered && <MobileTalkUI />}
      {endInfo && <EndCard info={endInfo} onBack={() => setEndInfo(null)} />}
      {!CLEAN && <PerfHUD />}{/* ?clean=1: no DOM perf overlay for capture */}
      <JudgeMode />{/* hidden: type "judge" — live runtime chain, Day 6-7 cinematic pass */}
    </HQProvider>
  )
}
