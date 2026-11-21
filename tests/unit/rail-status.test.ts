import { describe, expect, it } from 'vitest';
import { PAINT_JOBS } from '../../src/game/palette';
import type { Contestant } from '../../src/minigames/types';
import { STATUS_BIT, STATUS_KINDS, statusList } from '../../src/minigames/shared/statusKinds';
import { STATUS_DEFS } from '../../src/minigames/shared/statusIcons';
import { PanZoom } from '../../src/minigames/shared/panZoom';
import { SQUAD_ZOOM, squadView } from '../../src/minigames/toysquad/camera';
import { squadRules, standings, type SquadState } from '../../src/minigames/toysquad/rules';
import { makeFighters } from '../../src/minigames/toysquad/combat';
import { SQUAD_STATUSES, fighterStatus } from '../../src/minigames/toysquad/info';
import { viewedSquad } from '../../src/minigames/toysquad/local';
import { tumbleRules, type TdState } from '../../src/minigames/towertumble/rules';
import { TUMBLE_STATUSES, enemyStatus } from '../../src/minigames/towertumble/status';

const who = (id: string): Contestant => ({ id, name: id, paint: PAINT_JOBS[0], hat: 'none', keySkin: 'classic', isLocal: id === 'p0', bot: 'normal' });

describe('shared status badges', () => {
  it('one bit per kind, every kind drawn, and both games only use kinds that exist', () => {
    expect(new Set(Object.values(STATUS_BIT)).size).toBe(STATUS_KINDS.length);
    expect(statusList(STATUS_BIT.burn | STATUS_BIT.mark)).toEqual(['burn', 'mark']);
    for (const k of STATUS_KINDS) { expect(STATUS_DEFS[k].fill.length).toBeGreaterThan(0); expect(STATUS_DEFS[k].name).toBeTruthy(); }
    expect(TUMBLE_STATUSES).toEqual(['slow', 'burn', 'stun', 'mark', 'shred']);
    for (const k of [...TUMBLE_STATUSES, ...SQUAD_STATUSES]) expect(STATUS_KINDS).toContain(k);
  });

  it('Tower Tumble: an enemy shows exactly the debuffs the rules gave it, until they wear off', () => {
    const s: TdState = tumbleRules.init([who('p0')], 3);
    s.wave = 6; s.phaseEnds = s.t; tumbleRules.step(s, {}, 16); tumbleRules.step(s, {}, 16);
    const e = s.players[0].enemies[0];
    expect(e.kind).toBe('beetle');
    expect(enemyStatus(e, s.t, s.wave)).toBe(0);
    e.slow = 0.3; e.slowUntil = s.t + 1000; e.burn = 4; e.burnUntil = s.t + 1000; e.stunUntil = s.t + 500; e.markUntil = s.t + 800; e.armour -= 1;
    expect(statusList(enemyStatus(e, s.t, s.wave))).toEqual(['burn', 'slow', 'stun', 'mark', 'shred']);
    expect(statusList(enemyStatus(e, s.t + 600, s.wave))).toEqual(['burn', 'slow', 'mark', 'shred']);
    expect(statusList(enemyStatus(e, s.t + 2000, s.wave))).toEqual(['shred']);
  });

  it('Toy Squad: poison, stun, mark, silence and net-negative buffs, read the way the battle reads them', () => {
    const [u] = makeFighters([{ id: 1, kind: 'soldier', tier: 1, cell: 0 }], 0, []);
    u.magic.buffs = [];
    expect(fighterStatus(u, 4)).toBe(0);
    u.poison = 2; u.stunnedUntil = 5; u.magic.markedUntil = 6; u.magic.silencedUntil = 4;
    u.magic.buffs = [{ key: 'a', stat: 'haste', amount: -1, until: 9 }, { key: 'b', stat: 'armour', amount: -2, until: 9 }, { key: 'c', stat: 'damage', amount: -1, until: 9 }];
    expect(statusList(fighterStatus(u, 4))).toEqual(['poison', 'slow', 'stun', 'mark', 'shred', 'weaken']);
    // Silence ran out (it no longer blocks the next tick); a positive armour buff cancels the negative one.
    u.magic.buffs.push({ key: 'd', stat: 'armour', amount: 3, until: 9 });
    expect(statusList(fighterStatus(u, 4))).not.toContain('silence');
    expect(statusList(fighterStatus(u, 4))).not.toContain('shred');
    u.hp = 0;
    expect(fighterStatus(u, 4)).toBe(0);
  });
});

describe('Toy Squad player rail', () => {
  it('records how each battle went (public), and the rail order is the placement order', () => {
    const s: SquadState = squadRules.init([who('p0'), who('p1'), who('p2')], 9, { buildMs: 1000, battleMs: 2000, recapMs: 500 });
    expect(s.players.every((p) => p.last === null)).toBe(true);
    s.players[0].units.push({ id: 900, kind: 'brass-behemoth', tier: 3, cell: 0 });
    while (s.phase !== 'recap') squadRules.step(s, {}, 100);
    const own = s.battles.find((b) => b.owner === 'p0')!;
    expect(s.players[0].last).toBe(own.outcome);
    for (const p of s.players) expect(['win', 'loss', 'draw']).toContain(p.last);
    expect(standings(s).map((p) => p.id)).toEqual(squadRules.result(s).placements.map((p) => p.contestantId));
    expect(viewedSquad(s.players, 'p0', 'p2')).toBe('p2');
    expect(viewedSquad(s.players, 'p0', 'nobody')).toBe('p0');
    expect(viewedSquad(s.players, 'p0', null)).toBe('p0');
  });
});

describe('board pan and zoom', () => {
  // A flat stand-in for the camera: screen pixels map to the table at 10 px per unit, scaled by zoom, centred on the pan.
  const make = () => {
    const v = new PanZoom({ minZoom: 1, maxZoom: 3, panX: 14, panZ: 14 });
    const ground = (x: number, y: number) => ({ x: v.panX + (x - 200) / (10 * v.zoom), z: v.panZ + (y - 200) / (10 * v.zoom) });
    return { v, ground, apply: () => {} };
  };
  it('zooms toward the cursor (that table point stays put) and clamps zoom', () => {
    const { v, ground, apply } = make();
    const before = ground(300, 260);
    v.zoomAt(2, 300, 260, ground, apply);
    expect(v.zoom).toBe(2);
    const after = ground(300, 260);
    expect(after.x).toBeCloseTo(before.x, 6); expect(after.z).toBeCloseTo(before.z, 6);
    v.zoomAt(10, 200, 200, ground, apply);
    expect(v.zoom).toBe(3);
    v.wheel(5000, 0, 200, 200, ground, apply);
    expect(v.zoom).toBe(1);
    expect(v.changed).toBe(true); // the pan from zooming toward (300, 260) remains
    v.reset();
    expect(v.changed).toBe(false);
  });
  it('a one-finger drag pans, clamped so the board cannot be lost; two fingers pinch', () => {
    const { v, ground, apply } = make();
    v.down(1, 200, 200); v.startPan(200, 200, ground);
    v.move(1, 150, 200, ground, apply);
    expect(v.panX).toBeCloseTo(5, 6);
    v.move(1, -5000, -5000, ground, apply);
    expect(Math.abs(v.panX)).toBeLessThanOrEqual(14); expect(Math.abs(v.panZ)).toBeLessThanOrEqual(14);
    v.up(1);
    v.reset();
    expect(v.down(1, 150, 200)).toBe(false);
    expect(v.down(2, 250, 200)).toBe(true);
    v.move(2, 350, 200, ground, apply); // fingers twice as far apart
    expect(v.pinching).toBe(true);
    expect(v.zoom).toBeCloseTo(2, 6);
    v.up(1); v.up(2);
    expect(v.pinching).toBe(false);
  });
  it('Toy Squad: no pan at the fitted zoom, and only as far as the zoom hides (panRoom)', () => {
    const v = new PanZoom({ minZoom: squadView.limits.minZoom, maxZoom: squadView.limits.maxZoom, panX: 15, panZ: 15, panRoom: squadView.limits.panRoom });
    const ground = (x: number, y: number) => ({ x: v.panX + (x - 200) / (10 * v.zoom), z: v.panZ + (y - 200) / (10 * v.zoom) });
    v.down(1, 200, 200); v.startPan(200, 200, ground); v.move(1, -5000, -5000, ground, () => {}); v.up(1);
    expect(v.panX).toBeCloseTo(0, 9); expect(v.panZ).toBeCloseTo(0, 9);
    v.zoomAt(2, 200, 200, ground, () => {});
    v.down(1, 200, 200); v.startPan(200, 200, ground); v.move(1, -5000, 5000, ground, () => {}); v.up(1);
    expect(v.panX).toBeCloseTo(7.5, 6); expect(v.panZ).toBeCloseTo(-7.5, 6); // 15 × (1 − 1/2)
    v.zoomAt(100, 200, 200, ground, () => {});
    expect(v.zoom).toBe(SQUAD_ZOOM.max);
    v.zoomAt(0.01, 200, 200, ground, () => {});
    expect(v.zoom).toBe(1); expect(v.panX).toBeCloseTo(0, 9); expect(v.panZ).toBeCloseTo(0, 9); // zooming back out recentres
  });
});
