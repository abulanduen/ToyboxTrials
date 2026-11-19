import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { MINIGAMES } from '../../src/minigames/registry';
import { TUTORIALS, tutorialText } from '../../src/minigames/tutorials';

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
      expect(s.caption.trim()).not.toBe('');
      expect(s.image).toMatch(/^\.\/assets\/ui\/tutorials\/[a-z-]+-\d\.webp$/);
      const file = new URL(`../../public/${s.image}`, import.meta.url);
      expect(existsSync(file), `missing gameplay photo: ${s.image}`).toBe(true);
      if (existsSync(file)) expect(readFileSync(file).subarray(8, 12).toString()).toBe('WEBP');
      for (const text of [s.text, s.touch].filter((t): t is string => !!t)) {
        const parts = tutorialText(text, s.emphasis);
        expect(parts.map(p => p.text).join('')).toBe(text);
        expect(parts.some(p => p.strong), `no emphasis: ${s.title}`).toBe(true);
      }
      // Keep the explanation concise alongside its gameplay photo.
      expect(s.text.length).toBeLessThanOrEqual(200);
      if (s.touch) expect(s.touch.length).toBeLessThanOrEqual(200);
    }
  });

  it('only covers real games', () => {
    const ids = new Set(MINIGAMES.map((g) => g.id));
    for (const id of Object.keys(TUTORIALS)) expect(ids.has(id as never)).toBe(true);
  });

  it('keeps literal text safe and chooses whole overlapping phrases first', () => {
    expect(tutorialText('<img> Press Space three times.', ['Space', 'Space three times', ''])).toEqual([
      { text: '<img> Press ', strong: false },
      { text: 'Space three times', strong: true },
      { text: '.', strong: false },
    ]);
  });
});
