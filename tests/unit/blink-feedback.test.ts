import { describe, expect, it } from 'vitest';
import { blinkRules } from '../../src/minigames/blink/rules';
import { dangerCharge } from '../../src/minigames/blink/Feedback';
import { PAINT_JOBS } from '../../src/game/palette';
import type { Contestant } from '../../src/minigames/types';

const toy = (id: string): Contestant => ({ id, name: id, paint: PAINT_JOBS[0], hat: 'none', keySkin: 'classic', isLocal: id === 'you' });

describe('Blink Duel danger warning', () => {
  it('lights up only while the local toy is inside a live enemy wind-up, growing with the charge', () => {
    const s = blinkRules.init([toy('you'), toy('bot')], 3);
    const [me, bot] = s.players;
    Object.assign(me, { x: 0, z: 3 });
    Object.assign(bot, { x: 0, z: 0 });
    expect(dangerCharge(s, 'you')).toBe(0);
    // Bot winds up facing +z (towards us): we are inside its cone.
    bot.attack = { x: 0, z: 0, angle: 0, start: s.t, until: s.t + s.config.windupMs };
    const early = dangerCharge(s, 'you');
    expect(early).toBeGreaterThan(0);
    s.t += s.config.windupMs * 0.8;
    expect(dangerCharge(s, 'you')).toBeGreaterThan(early);
    // Facing away: no danger.
    bot.attack.angle = Math.PI;
    expect(dangerCharge(s, 'you')).toBe(0);
    // Our own wind-up never warns us.
    bot.attack = null;
    me.attack = { x: 0, z: 3, angle: Math.PI, start: s.t, until: s.t + 900 };
    expect(dangerCharge(s, 'you')).toBe(0);
    // Out of the match: no warning.
    bot.attack = { x: 0, z: 0, angle: 0, start: s.t, until: s.t + 900 };
    me.alive = false;
    expect(dangerCharge(s, 'you')).toBe(0);
  });
});
