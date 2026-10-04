# BUILD DOCTRINE — The Laws of Physics (2026-10-02, Amy's order)

Immutable constraints. Not guidelines. Every decision obeys these or it doesn't ship.

1. **Light** — Judges see the trailer before anything else. Photons hit retina before hands hit controllers. The demo video IS the entry. Every build must be capturable.
2. **Time** — 15 seconds to hook. 10 minutes max experience. Nov 18 deadline. Time is the hardest constraint; anything that spends it must earn it.
3. **Energy** — 72fps = 13.8ms per frame, both eyes. Every triangle, texture, and video decode costs energy. Budget: ≤45K tris/character, one 1024 atlas, ≤20 morph targets, ≤3 draw calls/character, ≤80 draw calls scene.
4. **Gravity** — Scope pulls everything down. One polished loop escapes; five rough features crash. New features must steal mass from old ones, never add it.
5. **Inertia** — A judge's first impression keeps moving in the direction it's pushed. Hook in 15s or lose them. Never open with a logo, menu, or explanation.
6. **Entropy** — Providers fail (Oct 2 outage proved it). The scripted fallback is the low-entropy state: it works when everything else breaks. The take-it-away test is never optional.

Corollary: **measure, don't feel.** Frame times from Perfetto, not vibes. Pass/fail from tests with evidence, not scores.
