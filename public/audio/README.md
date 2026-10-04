# The Screening Room — voice lines (drop point)

Flow-generated MP3s go here, one per dialogue line id. The VoiceEngine
(`src/audio/voice.js`) loads `./audio/<id>.mp3` and plays it as positional
audio from the speaking character's head. Missing file = captions only in
XR (desktop falls back to system TTS — never in-headset).

**Voices: Flow-generated only. NO ElevenLabs for HQ (Amy's rule).**

Line ids (see `src/director/script.js`):
- cold_g1, cold_m1, cold_g2, cold_m2
- vote_g1, vote_m1
- stunt_swing_g1, stunt_swing_m1, stunt_swing_g2, stunt_swing_m2
- stunt_chime_g1, stunt_chime_m1
- stunt_cats_g1, stunt_cats_m1
- end_m1, end_g1

Format: MP3, mono or stereo, any reasonable bitrate. Keep each line tight —
Flow credits are weekly-rationed.
