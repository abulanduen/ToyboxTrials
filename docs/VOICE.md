# Voice lines and background music

Status: **implemented** (text, playback hooks and synthesised music). **Pipwick's welcome tour is
recorded** (the owner's "In this town…" script, ElevenLabs voice "Brian – Calm, Collected and
Steady"); every other line (Pipwick's chat, the 14 greeters) is shown as text and is silent until
its recording is added.

### How the tour recording was made

The owner recorded the whole tour as **one take** (61.6 s). It was cut into one clip per tour stop
(`public/assets/audio/voice/pipwick-tour-<stop>.mp3`, mono 80 kbps) at the pauses between
paragraphs, at the middle of each silent gap, with ffmpeg; each clip was checked by transcribing it
(faster-whisper) so no word is clipped. The caption timings in `TOUR_CAPTIONS`
(`src/game/voiceLines.ts`) come from that transcription: the tour card shows the line a caption at a
time, following the voice, and moves on by itself about 0.9 s after each line ends (Next and Skip
still work at any time; the last stop waits for the player). With no sound yet (the browser hasn't
allowed audio), the captions run on the same schedule and the tour waits for Next.

To re-record: record the stops' lines (or the whole script again), replace the clips, and update
the `at` times in `TOUR_CAPTIONS` (seconds into each clip where each caption starts).

## Who speaks

- **Pipwick** (the Hub's welcome mascot): a small wind-up tin songbird in a postman's cap, coral
  with a cream belly, blue wings and a brass key in her back. Self-appointed "official Welcomer of
  the Playroom": bright, quick, a little officious, proud of her polished tin. She waits by the
  fountain plaza, flies new players round the Hub on their first visit, and replays the tour when
  you talk to her. Code: `src/scene/Pipwick.tsx`, `src/game/welcome.ts`, `src/game/tour.ts`.
- **The gate greeters**: one small peg-doll toy by each of the 14 trial arches, dressed for its
  game (Maestro Tibbs the conductor by Copycat, Jangles the jester by Jack-in-the-Box, Sir Rally the
  knight by the Siege fort, and so on). Each says hello, pitches its game in a sentence or two and
  asks "Want to have a go?"; the gate's usual Play prompt opens the trial's intro card.
  Code: `src/scene/Greeters.tsx`.

All are original characters.

## The script (hand this to the voice provider)

Every spoken line, with its id, speaker and exact text, is in **`src/game/voiceLines.ts`**:
`VOICE_LINES` (the flat list) and `SPEAKERS` (name plus casting/direction notes for each voice).
Ids are kebab case: `pipwick-tour-hello` … `pipwick-tour-bye`, `pipwick-chat-hello`,
`pipwick-chat-idle-1` … `pipwick-chat-idle-5`, `pipwick-chat-bye`, and
`greeter-<trial id>` for each greeter (e.g. `greeter-copycat-conductor`). The on-screen text is
the same string, so a recording must match it word for word (or change both together).

## Adding a recording

1. Record the line and export it as MP3 (mono is fine; aim for about −16 LUFS, trimmed silence).
2. Save it as **`public/assets/audio/voice/<id>.mp3`**, e.g.
   `public/assets/audio/voice/pipwick-tour-hello.mp3`.
3. Add an entry to `public/assets/asset-manifest.json` (`"file": "audio/voice/<id>.mp3"`, the
   source/provider, the voice used, date and licence). A unit test checks every listed voice file
   matches a line in the script.
4. Rebuild. The build lists which recordings exist (`vite.config.ts`, `virtual:voice-files`), so
   lines without a file never trigger a request. The dev server picks up added files with a reload.

Playback (`src/game/voice.ts`) goes through Web Audio: volume is master × **Voice volume**
(Settings), which also works on iOS; the background music ducks while a line plays; one line at a
time. Greeters speak when you walk up (not again for 25 s); Pipwick speaks each tour stop as she
lands, and the tour card follows the recording caption by caption.

## Background music

Calm background music is **synthesised in code** (Web Audio oscillators, no recordings and no
samples), composed live by `src/game/musicScore.ts` and played by `src/game/music.ts`. The owner
relaxed the earlier "music only for Music Box Rhythm" rule for this calm background music; it
stays original and synthesised.

- Generative, not a loop: a seeded composer writes one bar at a time (a slow chord walk through
  the piece's mode, a melody in four-bar phrases whose motifs return with new notes, a soft bass
  and pad, a density that breathes over about 24 bars). Unit tests check that no eight-bar passage
  repeats over five minutes.
- Calm by construction: 58–88 bpm, quiet velocities, at most about two melody notes a beat, no
  drums (some pieces have a barely-there clock tick).
- **Hub tracks** (picked at the **Jukebox** beside the Music Box Rhythm gate, saved per device,
  never synced online): Windowsill Waltz, Felt and Sawdust, Tin Lullaby, Clockwork Afternoon,
  Rainy Playroom, or "Quiet, please".
- **Trials** each have a mood (bright, playful, curious, breezy, warm, night, thoughtful, focus,
  twinkle, storybook, gallant) and sit lower while you play. Copycat Conductor is a listening game,
  so its music rests while you play. **Music Box Rhythm has no background music**: it plays its own
  tracks (`src/minigames/rhythm/`), which follow the master volume only.
- Crossfades over about three seconds on every screen or game change; fades out when the tab is
  hidden; starts only after the first tap or key press (browser autoplay rules).
- Phones: a handful of oscillators at a time; on the Low quality tier (the touch default) the pad
  uses one oscillator per note and the echo is left out.

Not verified: how any of this *sounds*. The music was written and checked by its numbers (scale,
tempo, density, repetition) and by the scheduler running in a headless browser; nobody has
listened to it on speakers yet, and CPU use on a real phone has not been measured.
