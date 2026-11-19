import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MINIGAMES } from '../../src/minigames/registry';
import { TUTORIALS } from '../../src/minigames/tutorials';
import { TUTORIAL_ART, type TutorialArtId } from '../../src/ui/tutorialArt';

/** Render one picture to SVG markup (no DOM needed). */
const render = (id: TutorialArtId) => renderToStaticMarkup(createElement(TUTORIAL_ART[id]));

describe('minigame tutorials', () => {
  const playable = MINIGAMES.filter((g) => g.status === 'playable');

  it.each(playable.map((g) => [g.id]))('%s has a quick tutorial', (id) => {
    const steps = TUTORIALS[id];
    expect(steps, `missing tutorial for ${id}`).toBeDefined();
    expect(steps!.length).toBeGreaterThanOrEqual(3);
    expect(steps!.length).toBeLessThanOrEqual(4);
    for (const s of steps!) {
      expect(s.title.trim()).not.toBe('');
      expect(s.text.trim()).not.toBe('');
      // Quick means quick: each step fits on a phone card without scrolling.
      expect(s.text.length).toBeLessThanOrEqual(200);
      if (s.touch) expect(s.touch.length).toBeLessThanOrEqual(200);
    }
  });

  it.each(playable.map((g) => [g.id]))('%s has a picture for every step', (id) => {
    const steps = TUTORIALS[id]!;
    const seen = new Set<string>();
    for (const s of steps) {
      // Every rule has a visual aid, and each step's picture is its own.
      expect(s.art, `${id}: "${s.title}" has no picture`).toBeTruthy();
      expect(TUTORIAL_ART[s.art], `${id}: unknown picture ${s.art}`).toBeTypeOf('function');
      expect(seen.has(s.art), `${id}: ${s.art} used twice`).toBe(false);
      seen.add(s.art);
      if (s.touchArt) {
        expect(TUTORIAL_ART[s.touchArt], `${id}: unknown touch picture ${s.touchArt}`).toBeTypeOf('function');
        expect(s.touchArt).not.toBe(s.art);
      }
    }
  });

  it('only covers real games', () => {
    const ids = new Set(MINIGAMES.map((g) => g.id));
    for (const id of Object.keys(TUTORIALS)) expect(ids.has(id as never)).toBe(true);
  });
});

describe('tutorial pictures', () => {
  const ids = Object.keys(TUTORIAL_ART) as TutorialArtId[];

  it.each(ids.map((id) => [id]))('%s renders a non-empty 260×150 SVG', (id) => {
    const svg = render(id);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 260 150"');
    // More than a background: real shapes.
    const shapes = svg.match(/<(path|rect|circle|ellipse|polygon)\b/g) ?? [];
    expect(shapes.length).toBeGreaterThan(8);
  });

  it.each(ids.map((id) => [id]))('%s has no baked-in text beyond key-cap and button labels', (id) => {
    const labels = [...render(id).matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    for (const l of labels) expect(l.length, `"${l}" in ${id}`).toBeLessThanOrEqual(10);
  });

  it('only uses palette colours', async () => {
    const { PALETTE, ROOM, RARITY } = await import('../../src/game/palette');
    const allowed = new Set([...Object.values(PALETTE), ...Object.values(ROOM).flat(), ...Object.values(RARITY)].map((c) => c.toUpperCase()));
    for (const id of ids) {
      for (const [hex] of render(id).matchAll(/#[0-9a-fA-F]{6}\b/g)) expect(allowed.has(hex.toUpperCase()), `${hex} in ${id}`).toBe(true);
    }
  });

  it('every picture is used by a tutorial step or the Hub sheet', () => {
    const used = new Set<string>();
    for (const steps of Object.values(TUTORIALS)) for (const s of steps!) for (const a of [s.art, s.touchArt]) if (a) used.add(a);
    for (const id of ids) if (!id.startsWith('hub-')) expect(used.has(id), `${id} is never shown`).toBe(true);
  });
});
