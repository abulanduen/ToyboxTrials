import { describe, expect, it } from 'vitest';
import { ELIM_DURATION, ELIM_REST, restingElimT } from '../../src/character/anim';

describe('knocked-out toys in minigames', () => {
  it('rest lying down, before the hub shrink-to-respawn (a zero-height toy blacked out the screen)', () => {
    // WindupBot squashes the toy to nothing over the last 0.25 s of ELIM_DURATION.
    expect(ELIM_REST).toBeLessThan(ELIM_DURATION - 0.25);
    expect(restingElimT(0.5)).toBe(0.5);
    expect(restingElimT(60)).toBe(ELIM_REST);
    expect(restingElimT(-1)).toBe(0);
  });
});
