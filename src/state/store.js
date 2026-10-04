// Continuity: localStorage — free, no cloud. Carried over from hq-v3.
const STORE_KEY = 'screeningroom.v5greybox'

const defaults = {
  visits: 0,
  lastVisit: null,
  votes: { swing: 0, chime: 0, cats: 0 },
  lastPick: null,
  stares: 0,
  mrRoomMode: true, // MR session shows YOUR room (env hidden) vs full meadow
  visitorName: null, // RETURN HOOK: remembered across visits ("welcome back, X")
  linesAsked: 0,    // talk-stage continuity
}

export const store = {
  data: { ...defaults },
  _subs: new Set(),
  // Reactive subscription: Hud and other DOM UI re-render on change.
  // (Fixes the stale vote counter — castVote() saved to localStorage but
  // the HUD never re-rendered.)
  subscribe(fn) {
    this._subs.add(fn)
    return () => { this._subs.delete(fn) }
  },
  emit() {
    for (const fn of this._subs) { try { fn(this.data) } catch (e) {} }
  },
  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY)
      if (raw) this.data = Object.assign({}, defaults, JSON.parse(raw))
    } catch (e) { /* private mode etc. — continuity degrades gracefully */ }
    return this.data
  },
  save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.data)) } catch (e) {}
    this.emit()
  },
  today() { return new Date().toISOString().slice(0, 10) },
}

store.load()
