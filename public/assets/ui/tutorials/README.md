# Quick tutorial gameplay photos

One 960×540 WebP for each of the 53 steps across 16 games. These are screenshots of Toybox
Trials itself, with deterministic examples staged using existing rules and the `?debug` hooks.
They are project-owned gameplay captures, not AI illustrations. Captions and emphasized phrases
live in `src/minigames/tutorials.ts`; the keyboard and touch instructions share the same photo.

Regenerate against a local **Vite dev server** (the capture helper imports the source modules):

```sh
BASE_URL=http://127.0.0.1:4175/ node tests/e2e/tutorial-capture.cjs
# Optional: regenerate only selected games
BASE_URL=http://127.0.0.1:4175/ node tests/e2e/tutorial-capture.cjs blink-duel,odd-page-out
```

Requires the repository's existing Playwright/Chromium test setup. The capture script freezes
the match clock and stages examples; it does not change gameplay or player saves. Regenerate
affected photos when controls, scenes or mechanics change. Test the intro cards with
`node tests/e2e/tutorials.cjs`; unit tests enforce photo coverage and readable emphasis.
