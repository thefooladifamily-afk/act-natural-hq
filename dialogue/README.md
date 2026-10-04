# Dialogue scaffold — greybox v5

The full pipeline is integrated and running on placeholder characters:

```
visitor taps a suggested line (TalkConsole, gaze/pinch)
  -> respondToLine()                      [src/dialogue/respond.js — THE SEAM]
  -> response text (scripted fallback today; live model later)
  -> VoiceEngine.speak()                  [src/audio/voice.js]
  -> TTS adapter                          [src/dialogue/ttsAdapter.js]
       Marlow: real ElevenLabs MP3s (May voice, generated at build time —
               public/audio/*.mp3; keys never touch the page)
       Gary:   Web Speech stub on desktop / captions-only in XR
               (no approved Gary ElevenLabs voice yet — Amy picks)
  -> viseme mouth                         [src/dialogue/visemeMap.js +
                                           src/characters/lipsync.js]
       text -> Oculus viseme stream -> 15 morph targets + jawOpen + mouth plane
```

## Files

- `personas/gary.md` — Gary's system prompt (written from canon: he protests
  the fame, insists on privacy, everything he does proves he loves it; the
  denial is the tell; never mean, always funny-silly).
- `personas/marlow.md` — Marlow's system prompt (dry-witted documentarian;
  Gary is her unwitting subject; she is making the documentary the visitor
  is inside of; deadpan, precise, faintly exasperated).
- `fallback-lines.json` — scripted fallback lines per character, organized by
  trigger: greeting, confusion, compliment, protest, goodbye, network_failure,
  general. Drawn from / faithful to EP001–EP012.

## The respondToLine() seam — exact insertion point

`src/dialogue/respond.js`, function `generateResponse()` (marked
`>>> MODEL INSERTION POINT >>>`). Contract: `return { speaker, text }`.

When the Meta Model API key arrives:

1. Stand up the key-holding proxy (hidden_files/voice-loop-design.md —
   Cloudflare Worker; the key lives there ONLY).
2. Replace the body of `generateResponse()` with a `fetch()` to the proxy,
   sending `{ persona, question, history, visitorName }`. The personas above
   are already imported as the system prompts.
3. Set `TTS.backend = 'elevenlabs'` in `src/dialogue/ttsAdapter.js` and set
   `ElevenLabsTTS.proxyUrl` (drop-in body documented in the file).
4. Gary's ElevenLabs voice id goes in `VOICE_IDS.gary` (Amy's pick; Marlow's
   May voice is already in `VOICE_IDS.marlow`).

Zero rework: the talk console, captions, viseme driver, watchdogs, and the
fallback ladder (any failure -> in-character cover line) are untouched.

## Regenerating Marlow's voice lines

`public/audio/*.mp3` were generated at build time with the connected
elevenlabs skill (May voice `aLthRrSon26HG0XSNBQ1`, model `eleven_v3`,
in-quota). To regenerate after script changes:

```
python3 ~/workspace/skills/elevenlabs/bin/tts.py --voice-id aLthRrSon26HG0XSNBQ1 \
  --text "line text" --out public/audio/<lineId>.mp3
```

## Testing the failure ladder

Append `?netfail=1` to the URL: every `respondToLine()` call serves the
in-character network-failure cover line (proves the fallback ladder without
breaking anything).
