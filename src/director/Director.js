// Director — the GREYBOX v5 show state machine.
//
// THE 10-MINUTE LOOP: enter -> watch (screening) -> vote -> stunt ->
// talk (dialogue) -> hook (return hook) -> end.
//
// HARD RULES (v3/v4, kept):
// - speechSynthesis NEVER runs while presenting (VoiceEngine enforces).
// - Every line has watchdogs; a stuck line can never stall the show.
// - Gaze is primary; all activations come from gaze dwell or tap/pinch on
//   the gaze target (session-level selectstart) — no hand rays, ever.
import * as THREE from 'three'
import { hq } from '../hq.js'
import { store } from '../state/store.js'
import { getAvatar } from '../characters/avatarRegistry.js'
import { LINES, STUNT_TITLES, SLIDES, SLIDE_DWELL_S } from './script.js'
import { respondToLine } from '../dialogue/respond.js'
import { exitXR } from '../xr/store.js'
import { record as recordMemory } from '../engine/SessionMemory.js'
import { fireFinale } from '../engine/DirectorResponses.js'

// META-NATIVE MAGIC (Task F): Marlow's whisper asides — conspiratorial,
// just-for-you lines. May's voice is the placeholder; Amy records the real
// ones in round 2. All original, English, no brands, no real persons.
const WHISPER_THING = "Psst — he's doing the thing again."
const WHISPER_REHEARSED = "Don't tell him I told you, but he rehearsed that."
const WHISPER_FILM = "See? This is why we film everything."

export class Director {
  constructor() {
    this.state = 'idle'
    this.paused = false
    this.choice = null
    this.stuntT = 0
    this.stuntPhase = null
    this.returning = false
    this._returnT = 0
    this._fallT = 0
    this._fallFrom = new THREE.Vector3()
    this._fallTo = new THREE.Vector3()
    this._released = false
    this._watchSlide = 0
    this._slideT = 0
    this._asked = 0
    this._history = []
    this._netFail = false
  }

  start() {
    if (this.state !== 'idle') return
    this.state = 'watch'
    this._netFail = typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('netfail')
    if (hq.screen) { hq.screen.rollDown(); hq.screen.card(SLIDES[0]) }
    // Horizon principle: lighting as mood — dim ~30% for the screening,
    // warm the room, spill screen glow. Cinema hush.
    if (hq.lights) {
      hq.lights.dimTo(0.7)
      if (hq.lights.setWarmth) hq.lights.setWarmth(0.6)
      if (hq.lights.setGlow) hq.lights.setGlow(0.5)
    }
    this._watchSlide = 0
    this._slideT = 0
    this.say(LINES.watch_m1, () =>
      this.say(LINES.watch_g1, () =>
        this.say(LINES.watch_m2, () =>
          this.say(LINES.watch_g2, () => this.showVote()))))
  }

  say(line, next) {
    hq.voice.onLineEnd = () => { if (next) next() }
    hq.voice.speak(line)
  }

  onHotspot(id) {
    const av = getAvatar(id)
    if (av) av.kick = 1
    if (this.state === 'watch') {
      // poke during the screening: Gary shushes himself
      if (id === 'gary') this.say(LINES.watch_g2)
    }
  }

  showVote() {
    this.state = 'voting'
    hq.voteUI.visible = true
    if (hq.screen) hq.screen.rollUp() // screening over — meadow + cards
    // Lights back up for the interactive vote — the cinema hush lifts.
    if (hq.lights) {
      hq.lights.dimTo(1)
      if (hq.lights.setWarmth) hq.lights.setWarmth(0)
      if (hq.lights.setGlow) hq.lights.setGlow(0)
    }
    this.say(LINES.vote_g1, () => {
      if (this.state === 'voting') this.say(LINES.vote_m1)
    })
  }

  castVote(id) {
    if (this.state !== 'voting') return
    this.state = 'stunt'
    this.choice = id
    // PORTAL TRANSITION (Amy 20-feature #6): the vote cards fly to the
    // screen instead of vanishing. The transition owns their visibility and
    // hides voteUI when the flight completes — do NOT hide it here.
    hq.portal = { t: 0 }
    store.data.votes[id] = (store.data.votes[id] || 0) + 1
    store.data.lastPick = id
    store.save()
    // Behavioral Cinema Engine: the vote is a COMPLETED milestone.
    try {
      recordMemory('COMPLETE', {
        source: 'director', target: `screeningRoom.vote.${id}`,
        data: { milestone: 'vote', choice: id },
      })
    } catch (e) { /* memory is non-essential */ }
    this.playStunt(id)
  }

  playStunt(id) {
    if (id === 'swing') this._stuntSwing()
    else if (id === 'chime') this._stuntChime()
    else this._stuntCats()
  }

  _stuntSwing() {
    const gary = getAvatar('gary')
    this.say(LINES.stunt_swing_g1, () => {
      this.say(LINES.stunt_swing_m1, () => {
        if (gary && gary.group && hq.swing.seat) {
          hq.swing.seat.attach(gary.group)
          gary.group.position.set(0, 0.06, 0)
          gary.group.rotation.set(0, 0, 0)
        }
        this.stuntPhase = 'swing'
        this.stuntT = 0
        this._released = false
        this.say(LINES.stunt_swing_g2)
      })
    })
  }

  _stuntChime() {
    this.say(LINES.stunt_chime_g1, () => this.say(LINES.stunt_chime_m1, () => this.startTalk()))
  }

  _stuntCats() {
    this.say(LINES.stunt_cats_g1, () => this.say(LINES.stunt_cats_m1, () => this.startTalk()))
  }

  // ---- TALK (dialogue stage) ----
  startTalk() {
    this.state = 'talk'
    this._asked = 0
    if (hq.talkUI) hq.talkUI.visible = true
    this.say(LINES.talk_m1, () => {
      if (this.state === 'talk') this.say(LINES.talk_g1)
    })
  }

  // The talk console's one entry point: tap a line -> persona -> model ->
  // TTS -> viseme mouth. respondToLine() is the seam; today the source is
  // the scripted fallback set (the Model API key has not arrived).
  async askLine(line) {
    if (this.state !== 'talk') return
    this.state = 'answering'
    this._asked++
    // beat: the visitor's line as a caption first
    hq.voice.speak({ speaker: 'you', text: line.question })
    await new Promise((r) => setTimeout(r, 900))
    let resp
    try {
      resp = await respondToLine(line, {
        visitorName: store.data.visitorName || null,
        history: this._history,
        netFail: this._netFail,
      })
    } catch (e) {
      resp = { speaker: line.target, text: '...', source: 'error' }
    }
    this._history.push({ role: 'visitor', text: line.question })
    this._history.push({ role: resp.speaker, text: resp.text })
    if (this._history.length > 12) this._history.splice(0, this._history.length - 12)
    // GazeTrack (Task F): the addressed character looks at the visitor
    // while they speak; gaze releases when the answer finishes.
    hq.addressedId = resp.speaker
    hq.voice.onLineEnd = () => { hq.addressedId = null; if (this.state === 'answering') this.state = 'talk' }
    hq.voice.speak({ speaker: resp.speaker, text: resp.text, id: resp.id })
  }

  endTalk() {
    if (this.state !== 'talk' && this.state !== 'answering') return
    if (hq.talkUI) hq.talkUI.visible = false
    hq.addressedId = null // gaze releases
    hq.voice.stop()
    // Behavioral Cinema Engine: the conversation is a COMPLETED milestone.
    try {
      recordMemory('COMPLETE', {
        source: 'director', target: 'screeningRoom.talkConsole',
        data: { milestone: 'talk', linesAsked: this._asked || 0 },
      })
    } catch (e) { /* memory is non-essential */ }
    this.playRecut()
  }

  // DIRECTOR MODE: a typed line -> Gary performs it live, immediately.
  // (Amy's director console; works any time, not only in the talk stage.)
  directLine(text) {
    const t = (text || '').trim().slice(0, 280)
    if (!t) return
    hq.voice.speak({ speaker: 'gary', text: t })
  }

  // ---- RECUT (the showrunner): after the conversation, the documentary
  // re-edits itself — STAGED AS THEATER (Amy 2026-10-02).
  //
  // The ~20-second beat, unmissable:
  //   1. room lights dim to ~30%
  //   2. Marlow's bridge line, quoting the visitor's EXACT words back
  //   3. title card with the visitor's question, rendered in-world
  //   4. the film replays the moment, re-cut around their words
  //   5. Gary reacts directly to the visitor
  //   6. lights come back up -> the normal hook
  //
  // Scripted fallback throughout: no AI required for any of it.
  playRecut() {
    this.state = 'recut'
    const asked = this._history.filter((h) => h.role === 'visitor').map((h) => h.text)
    // Word-boundary truncation: never cut the visitor's words mid-word.
    const raw = asked.length ? asked[asked.length - 1] : 'Gary'
    const topic = raw.length > 70 ? raw.slice(0, 70).replace(/\s+\S*$/, '') : raw
    const rot = this._asked % SLIDES.length
    this._recutSlides = [
      { kicker: 'RE-CUT — TONIGHT ONLY', title: 'THE FILM CHANGED', body: 'because you talked to them' },
      { kicker: 'YOU SAID IT', title: topic, body: 'the film re-cuts itself around your words' },
      ...SLIDES.map((_, i) => SLIDES[(i + rot) % SLIDES.length]),
    ]
    this._watchSlide = 0
    this._slideT = 0
    this._recutTopic = topic // the physical card shows these words
    this._cardShown = false
    if (hq.lights) {
      hq.lights.dimTo(0.3) // step 1: lights down
      // Task F room-reactive recut: warm the room + spill screen glow.
      if (hq.lights.setWarmth) hq.lights.setWarmth(1)
      if (hq.lights.setGlow) hq.lights.setGlow(0.7)
    }
    if (hq.screen) {
      hq.screen.rollDown()
      hq.screen.card(this._recutSlides[0])
    }
    this.say(
      // step 2: Marlow quotes the visitor's exact words back
      { speaker: 'marlow', text: `You said "${topic}" — so I'm re-cutting the film around it. Watch.` },
      () => {
        // Task F whisper 1: conspiratorial, while the re-cut plays.
        hq.voice.whisperAside(WHISPER_THING)
      },
    )
  }

  _tickRecut(dt) {
    if (!hq.screen || !this._recutSlides) return
    this._slideT += dt
    const DWELL = 4
    if (this._slideT >= DWELL) {
      if (this._watchSlide < this._recutSlides.length - 1) {
        this._slideT = 0
        this._watchSlide++
        hq.screen.card(this._recutSlides[this._watchSlide])
        // Task F physical card: Marlow holds up the visitor's words on the
        // YOU SAID IT slide — a card in the room's space, not a HUD.
        if (this._watchSlide === 1 && !this._cardShown && hq.physicalCard) {
          this._cardShown = true
          hq.physicalCard.show(this._recutTopic)
        }
      } else {
        this._recutGaryReact() // staged beat, step 5
      }
    }
  }

  // Step 5: Gary reacts directly to the visitor. Step 6: lights up, hook.
  _recutGaryReact() {
    this._recutSlides = null // stop the slide tick
    if (hq.physicalCard) hq.physicalCard.hide() // the cue card goes down
    // Task F whisper 2: conspiratorial, just before Gary performs.
    hq.voice.whisperAside(WHISPER_REHEARSED, () => {
      this.say(LINES.recut_g1, () => {
        if (hq.lights) {
          hq.lights.dimTo(1)
          if (hq.lights.setWarmth) hq.lights.setWarmth(0)
          if (hq.lights.setGlow) hq.lights.setGlow(0)
        }
        // Task F whisper 3: the button on the beat, then the normal hook.
        hq.voice.whisperAside(WHISPER_FILM, () => this.playHook())
      })
    })
  }

  // ---- HOOK (return hook) ----
  playHook() {
    this.state = 'hook'
    this.say(LINES.hook_m1, () =>
      this.say(LINES.hook_g1, () => this.endShow()))
  }

  // QA / accessibility: pause freezes the whole show tick (slides, stunts,
  // watchdogs keep running via voice). resume() continues. Used by the
  // automated checklist and any future pause control.
  pause() {
    if (this.paused) return
    this.paused = true
    if (hq.voice) hq.voice.stop()
  }
  resume() {
    this.paused = false
  }

  tick(dt) {
    if (this.paused) return
    if (this.state === 'watch') this._tickWatch(dt)
    if (this.state === 'recut') this._tickRecut(dt)
    if (this.state !== 'stunt') return
    if (this.choice === 'swing') this._tickSwing(dt)
  }

  _tickWatch(dt) {
    if (!hq.screen) return
    this._slideT += dt
    if (this._slideT >= SLIDE_DWELL_S && this._watchSlide < SLIDES.length - 1) {
      this._slideT = 0
      this._watchSlide++
      hq.screen.card(SLIDES[this._watchSlide])
    }
  }

  _tickSwing(dt) {
    const pivot = hq.swing.pivot
    const gary = getAvatar('gary')
    if (!pivot || !gary || !gary.group) return

    if (this.stuntPhase === 'swing') {
      this.stuntT += dt
      const t = this.stuntT
      const ang = -Math.sin(t * 1.15) * Math.min(1.15, 0.35 + t * 0.16)
      pivot.rotation.x = ang
      if (t > 6.4 && !this._released && ang < -0.95) {
        this._released = true
        const seat = hq.swing.seat
        seat.updateWorldMatrix(true, false)
        this._fallFrom.setFromMatrixPosition(seat.matrixWorld)
        this._fallTo.set(-2.0, 0, -3.2)
        gary.group.parent.remove(gary.group)
        findScene(pivot).add(gary.group)
        gary.group.position.copy(this._fallFrom)
        this._fallT = 0
        this.stuntPhase = 'fall'
      }
    } else if (this.stuntPhase === 'fall') {
      this._fallT += dt
      const k = Math.min(1, this._fallT / 0.85)
      const e = 1 - Math.pow(1 - k, 2)
      gary.group.position.lerpVectors(this._fallFrom, this._fallTo, e)
      gary.group.position.y = THREE.MathUtils.lerp(this._fallFrom.y, 0, e) + Math.sin(k * Math.PI) * 0.7
      gary.group.rotation.z = k * 0.5
      if (k >= 1) {
        gary.group.position.y = 0
        this.stuntPhase = 'landed'
        this._returnT = 0
        this.returning = true
        this.say(LINES.stunt_swing_m2, () => this._garyWalksBack())
      }
    } else if (this.stuntPhase === 'landed' && this.returning) {
      // KNOWN v3 IMPERFECTION, kept + documented: Gary glides (lerps) back.
      this._returnT += dt
      const k = Math.min(1, this._returnT / 2.6)
      gary.group.position.lerpVectors(this._fallTo, gary.home, k * k * (3 - 2 * k))
      gary.group.rotation.z *= 1 - k * 0.2
      if (k >= 1) {
        gary.group.position.copy(gary.home)
        gary.group.rotation.set(0, 0, 0)
        this.returning = false
        if (hq.swing.pivot) hq.swing.pivot.rotation.x *= 0.9
        this.startTalk()
      }
    }
  }

  _garyWalksBack() { /* the lerp in _tickSwing is the walk-back for now */ }

  endShow() {
    this.state = 'end'
    this.say(LINES.end_m1, () =>
      this.say(LINES.end_g1, () => {
        // Quest parity: exit XR so the DOM endcard is visible.
        if (hq.session.presenting) exitXR()
        if (hq.overlay.showEnd) hq.overlay.showEnd(this.choice, STUNT_TITLES[this.choice])
      }))
  }

  exitShow() {
    hq.voice.stop()
    // Behavioral Cinema Engine: the show is a COMPLETED milestone.
    try {
      recordMemory('COMPLETE', {
        source: 'director', target: 'screeningRoom.exit',
        data: { milestone: 'show', choice: this.choice },
      })
    } catch (e) { /* memory is non-essential */ }
    // P1 FINALE BRANCH: the ending is selected by real session facts and
    // fired through the canonical pipeline (memory -> director rule ->
    // spatial/audio response). The branch info rides to the endcard as
    // supporting evidence — the lighting + audio motif are the response.
    let finale = null
    try {
      finale = fireFinale()
    } catch (e) { /* finale is non-essential; the endcard still shows */ }
    if (hq.session.presenting) exitXR()
    // Quest parity fix (2026-10-03): the endcard MUST show in XR too.
    // exitXR() ends the session (async); showEnd renders the DOM endcard
    // which becomes visible once the headset returns to the flat page.
    // Previously the `else` skipped showEnd entirely in XR — the visitor
    // never saw their choice/title/finale.
    if (hq.overlay.showEnd) hq.overlay.showEnd(this.choice, this.choice ? STUNT_TITLES[this.choice] : null, finale)
  }
}

function findScene(obj) {
  let o = obj
  while (o) {
    if (o.isScene) return o
    o = o.parent
  }
  return null
}
