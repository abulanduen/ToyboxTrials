import { describe, expect, it } from 'vitest';
import { GRID_STICK_DEADZONE, snapStick } from '../../src/minigames/shared/gridStick';

describe('grid joystick snapping (Inferno Escape, Midnight Hunger)', () => {
  it('snaps to the dominant axis: up 0, right 1, down 2, left 3', () => {
    expect(snapStick(0, 1, null)).toBe(0);
    expect(snapStick(1, 0, null)).toBe(1);
    expect(snapStick(0, -1, null)).toBe(2);
    expect(snapStick(-1, 0, null)).toBe(3);
    expect(snapStick(0.3, 0.9, null)).toBe(0);
    expect(snapStick(-0.9, 0.4, null)).toBe(3);
  });

  it('a resting thumb inside the dead zone does not move the toy', () => {
    expect(snapStick(GRID_STICK_DEADZONE * 0.9, 0, null)).toBeNull();
    expect(snapStick(0, 0, 1)).toBeNull();
  });

  it('near a diagonal it keeps the current direction instead of zigzagging', () => {
    const d = Math.SQRT1_2;
    expect(snapStick(d + 0.02, d - 0.02, 0)).toBe(0); // was going up: stays up
    expect(snapStick(d - 0.02, d + 0.02, 1)).toBe(1); // was going right: stays right
    // ...but a clear turn still turns.
    expect(snapStick(0.95, 0.3, 0)).toBe(1);
    // A previous direction that isn't one of the two candidates is ignored.
    expect(snapStick(d + 0.02, d - 0.02, 2)).toBe(1);
  });
});
