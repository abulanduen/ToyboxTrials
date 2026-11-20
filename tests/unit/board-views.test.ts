/**
 * Looking at other boards (Toy Tower Tumble and Toy Squad): the floating popover placement, the
 * board summary, touch never merging on a tap, and the server sending every board's public picture
 * (towers, quests, builder; units, traits, passives) while still hiding the secrets.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { placePopover, type Box } from '../../src/minigames/shared/popover';
import { boardSummary } from '../../src/minigames/towertumble/info';
import { drainTumbleInput, inspectCell, resetTumbleUI, tapCell, useTumbleUI } from '../../src/minigames/towertumble/local';
import { tumbleRules, type TdPlayer, type TdState, type Tower } from '../../src/minigames/towertumble/rules';
import { traitCounts } from '../../src/minigames/toysquad/spellcraft';
import { GameRun } from '../../server/matchRunner';
import { makeBots } from '../../src/minigames/bots';
import type { Contestant } from '../../src/minigames/types';

const box = (left: number, top: number, w: number, h: number): Box => ({ left, top, right: left + w, bottom: top + h });
const inside = (b: Box, l: number, t: number, w: number, h: number) => l >= b.left && t >= b.top && l + w <= b.right && t + h <= b.bottom;
const overlaps = (a: Box, l: number, t: number, w: number, h: number) => l < a.right && l + w > a.left && t < a.bottom && t + h > a.top;

describe('floating popover placement', () => {
  const phone = box(10, 10, 370, 824), wide = box(10, 10, 824, 370);
  it('goes above or below on a tall screen, never over the anchor, inside the bounds', () => {
    const low = placePopover(box(180, 600, 30, 40), 300, 230, phone);
    expect(low.side).toBe('above'); expect(low.covers).toBe(false);
    expect(inside(phone, low.left, low.top, 300, 230)).toBe(true);
    const high = placePopover(box(180, 80, 30, 40), 300, 230, phone);
    expect(high.side).toBe('below'); expect(high.covers).toBe(false);
    expect(inside(phone, high.left, high.top, 300, 230)).toBe(true);
  });
  it('clamps sideways near the edges', () => {
    const edge = placePopover(box(12, 500, 30, 40), 300, 200, phone);
    expect(edge.left).toBe(10);
    const right = placePopover(box(350, 500, 28, 40), 300, 200, phone);
    expect(right.left + 300).toBe(380);
  });
  it('goes beside the anchor on a wide, short screen', () => {
    const at = placePopover(box(200, 150, 40, 50), 260, 340, wide);
    expect(at.side).toBe('right'); expect(at.covers).toBe(false);
    expect(inside(wide, at.left, at.top, 260, 340)).toBe(true);
    const nearRight = placePopover(box(700, 150, 40, 50), 260, 340, wide);
    expect(nearRight.side).toBe('left'); expect(overlaps(box(700, 150, 40, 50), nearRight.left, nearRight.top, 260, 340)).toBe(false);
  });
  it('with no free side, stays inside the bounds (and says it covers)', () => {
    const tiny = box(0, 0, 200, 200), a = box(80, 80, 40, 40);
    const at = placePopover(a, 190, 190, tiny);
    expect(inside(tiny, at.left, at.top, 190, 190)).toBe(true);
    expect(at.covers).toBe(true);
  });
});

const who = (id: string): Contestant => ({ id, name: id, paint: {} as never, hat: 'none' as never, keySkin: 'classic' as never, isLocal: id === 'you' });
let nextId = 50000;
const put = (s: TdState, p: TdPlayer, def: string, cell: number): Tower => {
  const t: Tower = { id: nextId++, def, cell, cd: 0, shots: 0, dealt: 0, bornAt: s.t, how: 'build', auraDamage: 0, auraSpeed: 0 };
  p.towers.push(t); return t;
};

describe('Toy Tower Tumble board summary', () => {
  it('counts towers by family (best tier) and groups them by tier, highest first', () => {
    const s = tumbleRules.init([who('you')], 7), p = s.players[0];
    put(s, p, 'tin-sentry', 0); put(s, p, 'tin-sentry', 1); put(s, p, 'cork-musketeer', 2); put(s, p, 'yo-yo-snare', 3);
    const sum = boardSummary(p);
    expect(sum.towers).toBe(4);
    expect(sum.families.map((f) => [f.family, f.count, f.best])).toEqual([['tin', 3, 2], ['paper', 0, 0], ['clockwork', 0, 0], ['rubber', 1, 3], ['plush', 0, 0]]);
    expect(sum.tiers.map((g) => [g.tier, g.total, g.towers.map((t) => `${t.def}×${t.count}`).join()])).toEqual([[3, 1, 'yo-yo-snare×1'], [2, 1, 'cork-musketeer×1'], [1, 2, 'tin-sentry×2']]);
    expect(boardSummary({ towers: [] })).toEqual({ towers: 0, families: expect.any(Array), tiers: [] });
  });
});

describe('Toy Tower Tumble: a tap never merges on touch', () => {
  let s: TdState, me: TdPlayer, a: Tower, b: Tower;
  beforeEach(() => {
    resetTumbleUI(); drainTumbleInput();
    s = tumbleRules.init([who('you'), who('bot')], 3); me = s.players[0];
    a = put(s, me, 'tin-sentry', 0); b = put(s, me, 'spark-bot', 2); // same tier, different towers
  });
  it('touch: tapping a same-tier partner selects it and keeps the first as its pair', () => {
    tapCell(me, a.cell, true);
    expect(useTumbleUI.getState().selected).toBe(a.cell);
    tapCell(me, b.cell, true);
    expect(drainTumbleInput()).toEqual([]);
    expect(useTumbleUI.getState()).toMatchObject({ selected: b.cell, pair: a.cell });
    // Tapping the selected tower again clears it (and the pair).
    tapCell(me, b.cell, true);
    expect(useTumbleUI.getState()).toMatchObject({ selected: null, pair: null });
  });
  it('mouse and keyboard keep the quick merge', () => {
    tapCell(me, a.cell, false);
    tapCell(me, b.cell, false);
    expect(drainTumbleInput()).toEqual([{ type: 'merge', from: a.cell, to: b.cell }]);
  });
  it('a board you only look at: a tap inspects a tower, or clears', () => {
    const bot = s.players[1], t = put(s, bot, 'felt-cub', 5);
    inspectCell(bot, t.cell); expect(useTumbleUI.getState().selected).toBe(t.cell);
    inspectCell(bot, 20); expect(useTumbleUI.getState().selected).toBe(null);
    inspectCell(bot, t.cell); inspectCell(bot, t.cell); expect(useTumbleUI.getState().selected).toBe(null);
    expect(drainTumbleInput()).toEqual([]);
  });
});

type Obj = Record<string, unknown>;
const human = (id: string): Contestant => ({ ...makeBots(1, 1, 'normal')[0], id, name: id, bot: undefined });
const field = (bots: number, humans: string[]) => [...humans.map(human), ...makeBots(99, bots, 'normal')];

describe('server views: every board is public, secrets are not', () => {
  it("Toy Tower Tumble: another board's towers, quests, builder, gold, lives and gifts reach every player; the roll stream and seed do not", () => {
    const run = new GameRun('toy-tower-tumble', field(3, ['p1', 'p2']), 21);
    while ((run.state as TdState).players[1].towers.length < 2) run.advance(250);
    const truth = run.state as TdState, rival = truth.players[1];
    rival.quests.collect5 = true; rival.gifts = ['tin-sentry'];
    const view = run.viewFor(run.publicView(), 'p1') as Obj;
    expect(view.seed).toBe(0);
    for (const p of view.players as TdPlayer[]) expect(p.rng).toBe(0);
    const seen = (view.players as TdPlayer[]).find((p) => p.id === rival.id)!;
    expect(seen.towers.map((t) => [t.def, t.cell])).toEqual(rival.towers.map((t) => [t.def, t.cell]));
    expect(seen.quests).toEqual(rival.quests);
    expect(seen.quests.collect5).toBe(true);
    expect([seen.builder, seen.gold, seen.lives, seen.gifts]).toEqual([rival.builder, rival.gold, rival.lives, ['tin-sentry']]);
    expect((view.orders as Obj)).toEqual(truth.orders as unknown as Obj);
    expect(boardSummary(seen)).toEqual(boardSummary(rival));
  });

  it("Toy Squad: another squad's units (so its traits), passives, level, coins and points reach every player; its shop and passive offers do not", () => {
    const run = new GameRun('toy-squad', field(3, ['p1', 'p2']), 77);
    // Through a round so squads have toys, then into round 3's passive choice.
    while ((run.state as { round: number }).round < 3) run.advance(500);
    const truth = run.state as { players: { id: string; units: { kind: string; tier: number; cell: number }[]; passives: string[]; passiveOffers: string[]; shop: unknown[]; level: number; coins: number; points: number }[] };
    const rival = truth.players.find((p) => p.id === 'p2')!;
    rival.passives.push('bargain');
    expect(rival.units.length).toBeGreaterThan(0);
    for (const watching of [null, 'p2']) {
      const view = run.viewFor(run.publicView(), 'p1', watching) as Obj;
      const seen = (view.players as typeof truth.players).find((p) => p.id === 'p2')!;
      expect(seen.units).toEqual(rival.units);
      expect(traitCounts(seen.units as never)).toEqual(traitCounts(rival.units as never));
      expect(seen.passives).toEqual(rival.passives);
      expect([seen.level, seen.coins, seen.points]).toEqual([rival.level, rival.coins, rival.points]);
      expect(seen.shop).toEqual([]);
      expect(seen.passiveOffers).toEqual([]);
      const mine = (view.players as typeof truth.players).find((p) => p.id === 'p1')!;
      expect(mine.shop.length).toBeGreaterThan(0);
    }
  });
});
