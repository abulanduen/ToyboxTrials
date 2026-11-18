import { describe, expect, it } from 'vitest';
import { MINIGAMES } from '../../src/minigames/registry';
import { TUTORIALS } from '../../src/minigames/tutorials';

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

  it('only covers real games', () => {
    const ids = new Set(MINIGAMES.map((g) => g.id));
    for (const id of Object.keys(TUTORIALS)) expect(ids.has(id as never)).toBe(true);
  });
});
