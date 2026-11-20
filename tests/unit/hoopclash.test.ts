/**
 * Hoop Clash rules core (src/minigames/hoopclash/rules.ts): teams, the Hub ball on a two-hoop
 * court, 2s and 3s, inbounds, the shot clock, halves, overtime, steals and snatches, bots,
 * determinism. The online server runs the same core, so these pin down online play too.
 */
import { describe, expect, it } from 'vitest';
import {
  CHARGE_MS,
  DEAD_MS,
  HALF_MS,
  STEP_MS,
  TOSS_MS,
  assignTeams,
  attackHoop,
  hoopRules,
  isDribbling,
  solveShotFor,
  type HoopConfig,
  type HoopInput,
  type HoopPlayer,
  type HoopState,
} from '../../src/minigames/hoopclash/rules';
import { COURT, COURT_SPEC, HOOPS, offAxis } from '../../src/minigames/hoopclash/court';
import { createHoopBot } from '../../src/minigames/hoopclash/bot';
import { makeBots } from '../../src/minigames/bots';
import { seededRng } from '../../src/minigames/rng';
import { STEAL_GUARD } from '../../src/game/hubPlaySim';
import { BOARD, predictCourtThrow, solveCourtShot, yawTo } from '../../src/minigames/shared/courtBall';
import { serverGame } from '../../server/games';
import type { Contestant, MatchEvent } from '../../src/minigames/types';
import { PAINT_JOBS } from '../../src/game/palette';

const human = (id: string): Contestant => ({ id, name: id.toUpperCase(), paint: PAINT_JOBS[0], hat: 'none', keySkin: 'classic', isLocal: id === 'you' });
const humans = (n: number) => ['you', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].slice(0, n).map(human);

function setup(n = 4, config: Partial<HoopConfig> = {}, seed = 42): HoopState {
  return hoopRules.init(humans(n), seed, config);
}

/** Step `ms` of match time with fixed inputs per player (latched by the rules). */
function run(s: HoopState, ms: number, inputs: Record<string, HoopInput[]> = {}, ev: MatchEvent[] = []) {
  const n = Math.round(ms / STEP_MS);
  for (let i = 0; i < n && s.phase !== 'over'; i++) {
    hoopRules.step(s, i === 0 ? inputs : {}, STEP_MS);
    ev.push(...hoopRules.drainEvents(s));
  }
  return ev;
}
const until = (s: HoopState, ok: () => boolean, maxMs = 20000, ev: MatchEvent[] = []) => {
  for (let t = 0; t < maxMs && !ok(); t += STEP_MS) {
    hoopRules.step(s, {}, STEP_MS);
    ev.push(...hoopRules.drainEvents(s));
  }
  expect(ok()).toBe(true);
  return ev;
};
const P = (s: HoopState, id: string) => s.players.find((p) => p.id === id)!;
const still = { type: 'in' as const, ax: 0, ay: 0, run: false, act: false };
const press = { ...still, act: true };

/** Skip the jump ball: `id` holds the ball in live play, everyone else parked out of the way. */
function giveBall(s: HoopState, id: string, x: number, z: number) {
  s.phase = 'live';
  s.phaseT = s.t;
  s.players.forEach((p, i) => Object.assign(p, { x: -30 + i * 2, z: COURT.halfW - 1, vx: 0, vz: 0, charge: -1 }));
  const p = P(s, id);
  Object.assign(p, { x, z, vx: 0, vz: 0 });
  const h = HOOPS[attackHoop(s, p.team)];
  p.yaw = yawTo(x, z, h);
  s.ball.holder = id;
  s.ball.grabT = s.t;
  s.ball.lastTeam = p.team;
  s.poss = p.team;
  s.shotClock = s.config.shotMs;
  return p;
}

/** Charge to exactly `power` and let go (the rules add one step of charge before the release). */
function shoot(s: HoopState, id: string, power: number, ev: MatchEvent[] = []) {
  run(s, STEP_MS, { [id]: [press] }, ev);
  P(s, id).charge = power * CHARGE_MS - STEP_MS;
  run(s, STEP_MS, { [id]: [still] }, ev);
  return ev;
}

/** A spot `d` from a team's attacking rim, `ang` radians round from straight out. */
function spot(s: HoopState, team: 0 | 1, d: number, ang = 0) {
  const h = HOOPS[attackHoop(s, team)];
  return { x: h.x + h.dx * d * Math.cos(ang) - h.dz * d * Math.sin(ang), z: h.z + h.dz * d * Math.cos(ang) + h.dx * d * Math.sin(ang) };
}

describe('teams', () => {
  it('4 toys or fewer play 2 v 2, more play 4 v 4; humans alternate, bots fill the smaller side', () => {
    expect(assignTeams(humans(2)).size).toBe(2);
    expect(assignTeams(humans(4)).size).toBe(2);
    expect(assignTeams(humans(5)).size).toBe(4);
    const field = [human('you'), ...makeBots(1, 3, 'normal')];
    const { teams, size } = assignTeams(field);
    expect(size).toBe(2);
    expect(teams.get('you')).toBe(0); // the local player is first: Red
    expect([...teams.values()].filter((t) => t === 0).length).toBe(2);
    // three humans in a lobby with bots: 2 Red, 1 Blue, and the bots even it up
    const lobby = [human('a'), human('b'), human('c'), ...makeBots(2, 3, 'normal')];
    const t2 = assignTeams(lobby);
    expect(['a', 'b', 'c'].map((id) => t2.teams.get(id))).toEqual([0, 1, 0]);
    expect([...t2.teams.values()].filter((t) => t === 0).length).toBe(3);
  });

  it('fills both teams to size with AI fillers, each with a jersey number unique on its team', () => {
    const s = hoopRules.init([human('you'), ...makeBots(3, 2, 'hard')], 9, {});
    expect(s.teamSize).toBe(2);
    expect(s.players.length).toBe(4);
    const fill = s.players.filter((p) => p.filler);
    expect(fill.length).toBe(1);
    expect(fill[0].ai).toBe('hard'); // the contestant bots' level
    expect(fill[0].look).not.toBeNull();
    const big = hoopRules.init([human('you'), human('p2'), ...makeBots(4, 3, 'easy')], 9, {});
    expect(big.teamSize).toBe(4);
    expect(big.players.length).toBe(8);
    for (const t of [0, 1]) {
      const mine = big.players.filter((p) => p.team === t);
      expect(mine.length).toBe(4);
      expect(new Set(mine.map((p) => p.num)).size).toBe(4);
    }
    expect(big.players.filter((p) => p.team === 0).map((p) => p.id)).toContain('you');
    expect(big.players.find((p) => p.id === 'p2')!.team).toBe(1);
  });

  it('Red attacks the east hoop first and the teams switch ends at halftime', () => {
    const s = setup();
    expect(attackHoop(s, 0)).toBe(1);
    expect(attackHoop(s, 1)).toBe(0);
    s.swapped = true;
    expect(attackHoop(s, 0)).toBe(0);
  });
});

describe('the ball on the court is the Hub ball', () => {
  it('sinks from close, middle and 3-point range with the solved power, off-axis too', () => {
    for (const [d, a] of [[10, 0], [15, 0.6], [20, -0.4], [24, 0.9]] as const) {
      const sol = solveCourtShot(d, a);
      expect(sol, `${d} ${a}`).not.toBeNull();
      const h = HOOPS[0];
      const x = h.x + h.dx * d * Math.cos(a) - h.dz * d * Math.sin(a);
      const z = h.z + h.dz * d * Math.cos(a) + h.dx * d * Math.sin(a);
      const body = { id: 'p', x, y: 0, z, yaw: yawTo(x, z, h) };
      expect(Math.abs(offAxis(h, body) - a)).toBeLessThan(1e-9);
      expect(predictCourtThrow(COURT_SPEC, body, body.yaw, sol!.power, null, 400, 1).hoop).toBe(0);
    }
    // Nothing goes in from under the rim or from beyond the far end (the Hub's throw range).
    expect(solveCourtShot(3)).toBeNull();
    expect(solveCourtShot(60)).toBeNull();
    expect(BOARD.back).toBeCloseTo(2.2, 6);
  });
});

describe('scoring', () => {
  it('2 points inside the arc, 3 beyond, credited to the shooter', () => {
    for (const [d, pts] of [[12, 2], [21, 3]] as const) {
      const s = setup();
      const at = spot(s, 0, d);
      giveBall(s, 'you', at.x, at.z);
      const ev = shoot(s, 'you', solveShotFor(s, P(s, 'you'))!);
      expect(ev.find((e) => e.type === 'shot')).toMatchObject({ by: 'you', three: pts === 3 });
      until(s, () => s.score[0] > 0, 4000, ev);
      expect(s.score).toEqual([pts, 0]);
      expect(ev.find((e) => e.type === 'score')).toMatchObject({ team: 0, pts, by: 'you', hoop: 1 });
      expect(P(s, 'you')).toMatchObject({ pts, made: 1, tries: 1, threes: pts === 3 ? 1 : 0 });
    }
  });

  it('after a basket the other team inbounds under the basket it was scored on, and must pass it in', () => {
    const s = setup();
    const at = spot(s, 0, 12);
    giveBall(s, 'you', at.x, at.z);
    const ev = shoot(s, 'you', solveShotFor(s, P(s, 'you'))!);
    until(s, () => s.phase === 'dead', 4000, ev);
    until(s, () => s.phase === 'inbound', DEAD_MS + 100, ev);
    const ib = s.inbound!;
    expect(ib.team).toBe(1);
    expect(ib.kind).toBe('basket');
    expect(Math.sign(ib.x)).toBe(Math.sign(HOOPS[1].x)); // under the east hoop
    expect(Math.abs(ib.x)).toBeGreaterThan(COURT.halfL);
    const by = P(s, ib.by!);
    expect(by.team).toBe(1);
    expect(s.ball.holder).toBe(by.id);
    // The clocks stand still until the ball is passed in.
    const clock = s.clock;
    run(s, 1000);
    expect(s.clock).toBe(clock);
    run(s, STEP_MS, { [by.id]: [{ type: 'pass' }] }, ev);
    expect(s.phase).toBe('live');
    expect(ev.some((e) => e.type === 'pass' && e.by === by.id)).toBe(true);
    // The teammate standing still catches the flat pass.
    until(s, () => s.ball.holder !== null, 3000, ev);
    expect(P(s, s.ball.holder!).team).toBe(1);
  });

  it('an inbounder who never passes passes on their own after the inbound limit', () => {
    const s = setup(4, { inboundMs: 2000 });
    const at = spot(s, 0, 12);
    giveBall(s, 'you', at.x, at.z);
    shoot(s, 'you', solveShotFor(s, P(s, 'you'))!);
    until(s, () => s.phase === 'inbound', 6000);
    until(s, () => s.phase === 'live', 2200);
  });
});

describe('out of bounds', () => {
  it('a holder who steps over a line gives the other team a sideline inbound', () => {
    const s = setup();
    giveBall(s, 'you', 0, COURT.halfW - 1.5);
    const ev = run(s, 1500, { you: [{ ...still, ay: -1 }] }); // walk south, over the near sideline
    expect(ev.find((e) => e.type === 'out')).toMatchObject({ team: 0 });
    until(s, () => s.phase === 'inbound', DEAD_MS + 200);
    expect(s.inbound).toMatchObject({ team: 1, kind: 'side' });
    expect(s.inbound!.z).toBeGreaterThan(COURT.halfW); // the side it went out on
  });

  it('a loose ball that lands outside the lines goes against the team that touched it last', () => {
    const s = setup();
    giveBall(s, 'p2', 0, 0); // p2 is Blue
    expect(P(s, 'p2').team).toBe(1);
    s.ball.holder = null;
    Object.assign(s.ball, { x: 0, y: 3, z: -COURT.halfW + 1, vx: 0, vy: 0, vz: -30, lastTeam: 1 });
    const ev = until(s, () => s.phase === 'dead', 2000);
    expect(ev.find((e) => e.type === 'out')).toMatchObject({ team: 1 });
    until(s, () => s.phase === 'inbound', DEAD_MS + 100);
    expect(s.inbound).toMatchObject({ team: 0 });
    expect(s.inbound!.z).toBeLessThan(-COURT.halfW);
  });
});

describe('the shot clock', () => {
  it('runs out on a team that holds the ball: violation, the other team inbounds', () => {
    const s = setup(4, { shotMs: 3000 });
    giveBall(s, 'you', 0, 0);
    const ev = run(s, 2900);
    expect(s.phase).toBe('live');
    run(s, 300, {}, ev);
    expect(ev.find((e) => e.type === 'violation')).toMatchObject({ team: 0 });
    until(s, () => s.phase === 'inbound', DEAD_MS + 100);
    expect(s.inbound!.team).toBe(1);
    expect(s.shotClock).toBe(3000);
  });

  it('a shot in the air stops it; touching the rim gives the next possession a fresh clock', () => {
    const s = setup(4, { shotMs: 6000 });
    const at = spot(s, 0, 15);
    giveBall(s, 'you', at.x, at.z);
    run(s, 2000);
    const left = s.shotClock;
    expect(left).toBeLessThan(4100);
    // a miss that clanks the rim: too strong by a little
    shoot(s, 'you', solveShotFor(s, P(s, 'you'))! + 0.06);
    const ev = until(s, () => s.rimReset || s.score[0] > 0, 3000);
    if (s.score[0] === 0) {
      expect(ev.some((e) => e.type === 'rim')).toBe(true);
      expect(s.shotClock).toBeGreaterThan(left - 400); // paused while it flew
      // Blue picks up the rebound: full clock
      const b = P(s, 'p2');
      Object.assign(b, { x: s.ball.x, z: s.ball.z });
      until(s, () => s.ball.holder !== null, 4000);
      expect(s.shotClock).toBeGreaterThan(5800);
    }
  });
});

describe('halves, overtime and the end', () => {
  it('halftime: the buzzer, a pause, then the teams switch ends and the tip loser inbounds', () => {
    const s = setup(4, { halfMs: 2000 });
    const ev = until(s, () => s.phase === 'live', TOSS_MS + 100);
    // nobody touches the jump ball; let the clock run out
    s.tip = 0;
    until(s, () => s.phase === 'half', 4000, ev);
    expect(ev.some((e) => e.type === 'buzzer')).toBe(true);
    expect(ev.some((e) => e.type === 'half')).toBe(true);
    until(s, () => s.phase === 'inbound', HALF_MS + 100, ev);
    expect(s.period).toBe(2);
    expect(s.swapped).toBe(true);
    expect(attackHoop(s, 0)).toBe(0);
    expect(s.clock).toBe(2000);
    expect(s.inbound!.team).toBe(1);
  });

  it('a tie goes to overtime with a jump ball; the next basket wins', () => {
    const s = setup(4, { halfMs: 1000 });
    s.period = 2;
    s.swapped = true;
    const ev = until(s, () => s.phase === 'dead' && s.period === 3, 4000);
    expect(ev.some((e) => e.type === 'overtime')).toBe(true);
    expect(s.clock).toBe(s.config.otMs);
    until(s, () => s.phase === 'jump', 4000, ev);
    until(s, () => s.phase === 'live', TOSS_MS + 100, ev);
    const at = spot(s, 1, 12);
    giveBall(s, 'p2', at.x, at.z);
    shoot(s, 'p2', solveShotFor(s, P(s, 'p2'))!, ev);
    until(s, () => s.phase === 'final', 4000, ev);
    expect(s.winner).toBe(1);
    expect(ev.find((e) => e.type === 'final')).toMatchObject({ winner: 1 });
    until(s, () => hoopRules.isOver(s), 4000);
    const res = hoopRules.result(s);
    // The winning team shares 1st; the losers share the place after them.
    const place = (id: string) => res.placements.find((p) => p.contestantId === id)!.place;
    expect(place('p2')).toBe(1);
    expect(place('p4')).toBe(1);
    expect(place('you')).toBe(3);
    expect(place('p3')).toBe(3);
    expect(res.stats).toMatchObject({ red: 0, blue: 2, overtime: 1, winner: 1 });
  });

  it('overtime is capped: no basket by its end is a tie, and everyone shares 1st', () => {
    const s = setup(4, { halfMs: 500, otMs: 1500 });
    s.period = 2;
    s.swapped = true;
    until(s, () => s.period === 3 && s.phase === 'live', 8000);
    until(s, () => s.phase === 'final', 3000);
    expect(s.winner).toBe('tie');
    until(s, () => hoopRules.isOver(s), 4000);
    expect(hoopRules.result(s).placements.every((p) => p.place === 1)).toBe(true);
  });

  it('a shot released before the buzzer still counts when it drops', () => {
    const s = setup(4, { halfMs: 120_000 });
    const at = spot(s, 0, 14);
    giveBall(s, 'you', at.x, at.z);
    s.clock = 200;
    const ev = shoot(s, 'you', solveShotFor(s, P(s, 'you'))!);
    until(s, () => s.phase !== 'live', 3000, ev);
    expect(ev.some((e) => e.type === 'buzzer')).toBe(true);
    expect(s.score[0]).toBe(2);
    // then the half ends
    until(s, () => s.phase === 'half', DEAD_MS + 200, ev);
  });
});

describe('steals and snatches (the Hub rules)', () => {
  it('a swipe steals the ball off a dribbler once the guard has passed; never off a toy standing still', () => {
    const s = setup();
    const me = giveBall(s, 'you', 0, 0);
    const def = P(s, 'p2');
    Object.assign(def, { x: 2.2, z: 0.5 });
    // Standing still with it: safe.
    run(s, STEAL_GUARD * 1000 + 100);
    run(s, 400, { p2: [press] });
    expect(s.ball.holder).toBe('you');
    // Dribbling (moving on the ground): the next swipe takes it.
    run(s, 300, { you: [{ ...still, ax: 0.5 }], p2: [still] });
    expect(isDribbling(me)).toBe(true);
    Object.assign(def, { x: me.x + 1.9, z: me.z + 0.6 });
    const ev = run(s, 700, { p2: [press] });
    expect(s.ball.holder).toBe('p2');
    expect(ev.find((e) => e.type === 'steal')).toMatchObject({ by: 'p2', from: 'you' });
    expect(def.steals).toBe(1);
    // The new holder is guarded for STEAL_GUARD: an immediate swipe back fails.
    Object.assign(me, { x: def.x + 1.5, z: def.z });
    run(s, 300, { p2: [{ ...still, ax: -0.6 }] });
    run(s, 400, { you: [press] });
    expect(s.ball.holder).toBe('p2');
  });

  it('a snatch near the shooter on the way up is a block', () => {
    const s = setup();
    const at = spot(s, 0, 14);
    const me = giveBall(s, 'you', at.x, at.z);
    const def = P(s, 'p2');
    const f = { x: Math.sin(me.yaw), z: Math.cos(me.yaw) };
    Object.assign(def, { x: me.x + f.x * 2.4, z: me.z + f.z * 2.4 });
    run(s, STEP_MS, { you: [press] });
    me.charge = 0.4 * CHARGE_MS;
    const ev = run(s, STEP_MS * 2, { you: [still], p2: [press] });
    run(s, 300, {}, ev);
    expect(s.ball.holder).toBe('p2');
    expect(ev.find((e) => e.type === 'block')).toMatchObject({ by: 'p2', from: 'you' });
    expect(def.blocks).toBe(1);
  });

  it('a loose ball on the floor is picked up by walking into it', () => {
    const s = setup();
    giveBall(s, 'you', 0, 0);
    s.ball.holder = null;
    Object.assign(s.ball, { x: 5, y: 1, z: 0, vx: 0, vy: 0, vz: 0 });
    run(s, 900, { you: [{ ...still, ax: 1 }] });
    expect(s.ball.holder).toBe('you');
  });

  it('the jump ball is snatched as it falls between the two jumpers', () => {
    const s = setup();
    const ev = until(s, () => s.phase === 'live', TOSS_MS + 100);
    const jumper = s.players.find((p) => p.team === 0 && Math.abs(p.x) < 3)!;
    until(s, () => s.ball.vy < 0 && s.ball.y < 5.2, 2000, ev);
    run(s, 200, { [jumper.id]: [press] }, ev);
    expect(s.ball.holder).toBe(jumper.id);
    expect(s.tip).toBe(0);
    expect(s.poss).toBe(0);
  });
});

describe('passing', () => {
  it('a pass goes to the teammate you face; a human calling for it gets it from a bot', () => {
    const s = setup();
    const me = giveBall(s, 'you', 0, 0);
    const mate = s.players.find((p) => p.team === me.team && p !== me)!;
    Object.assign(mate, { x: 0, z: -12 });
    me.yaw = Math.PI; // facing north (−z)
    const ev = run(s, STEP_MS, { you: [{ type: 'pass' }] });
    expect(ev.find((e) => e.type === 'pass')).toMatchObject({ by: 'you', to: mate.id });
    until(s, () => s.ball.holder !== null, 2000, ev);
    expect(s.ball.holder).toBe(mate.id);
    expect(ev.some((e) => e.type === 'catch' && e.by === mate.id)).toBe(true);
  });

  it('bot teammates pass to a human who calls for the ball', () => {
    const field = [human('you'), ...makeBots(5, 3, 'normal')];
    const s = hoopRules.init(field, 77, {});
    const me = P(s, 'you');
    const mate = s.players.find((p) => p.team === me.team && p !== me)!;
    giveBall(s, mate.id, 0, 0);
    Object.assign(me, { x: 0, z: -9 });
    const bot = createHoopBot();
    const rng = seededRng(1);
    const ev: MatchEvent[] = [];
    hoopRules.step(s, { you: [{ type: 'pass' }] }, STEP_MS); // no ball: a call
    ev.push(...hoopRules.drainEvents(s));
    expect(ev.some((e) => e.type === 'call' && e.by === 'you')).toBe(true);
    for (let i = 0; i < 90 && s.ball.holder !== 'you'; i++) {
      const inputs: Record<string, HoopInput[]> = {};
      for (const c of field) if (c.bot) inputs[c.id] = bot.decide(s, c, STEP_MS, rng);
      hoopRules.step(s, inputs, STEP_MS);
      ev.push(...hoopRules.drainEvents(s));
    }
    expect(ev.some((e) => e.type === 'pass' && e.by === mate.id && e.to === 'you')).toBe(true);
  });
});

describe('bots and determinism', () => {
  function playOut(n: number, seed: number, diff: 'easy' | 'normal' | 'hard', halfMs = 40_000) {
    const field = [human('you'), ...makeBots(seed, n - 1, diff)];
    const s = hoopRules.init(field, seed, { halfMs });
    const bot = createHoopBot();
    const rngs = new Map(field.map((c, i) => [c.id, seededRng(seed + i)]));
    const types = new Set<string>();
    for (let i = 0; i < 60 * 60 * 6 && !hoopRules.isOver(s); i++) {
      const inputs: Record<string, HoopInput[]> = {};
      for (const c of field) if (c.bot) inputs[c.id] = bot.decide(s, c, STEP_MS, rngs.get(c.id)!);
      hoopRules.step(s, inputs, STEP_MS);
      for (const e of hoopRules.drainEvents(s)) types.add(e.type);
    }
    return { s, types };
  }

  it('bots play a whole game: shots, passes, baskets, a half and a result', () => {
    const { s, types } = playOut(8, 5, 'normal');
    expect(hoopRules.isOver(s)).toBe(true);
    for (const t of ['jumpball', 'shot', 'score', 'pass', 'inbound', 'half', 'final']) expect(types.has(t), t).toBe(true);
    expect(s.score[0] + s.score[1]).toBeGreaterThan(4);
    const res = hoopRules.result(s);
    expect(res.placements.length).toBe(8);
    expect(res.placements.find((p) => p.contestantId === 'you')).toBeDefined();
  });

  it('is deterministic: the same seed and inputs give the same game', () => {
    const a = playOut(4, 11, 'hard', 15_000).s;
    const b = playOut(4, 11, 'hard', 15_000).s;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = playOut(4, 12, 'hard', 15_000).s;
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });

  it('a player who leaves an online match is handed to the AI (the teams stay even)', () => {
    const s = setup(4);
    hoopRules.forfeit(s, 'p3');
    const p = P(s, 'p3');
    expect(p.forfeit).toBe(true);
    expect(p.ai).toBe('normal');
    until(s, () => s.phase === 'live', TOSS_MS + 100);
    run(s, 3000);
    expect(hoopRules.result(s).placements.find((x) => x.contestantId === 'p3')!.forfeit).toBe(true);
  });
});

describe('online', () => {
  it('validates the stick, the held button and passes; hides the seed and the AI stream', () => {
    const g = serverGame('hoop-clash');
    expect(g.validate({ type: 'in', ax: 0.5, ay: -1, run: true, act: false })).toEqual({ type: 'in', ax: 0.5, ay: -1, run: true, act: false });
    expect(g.validate({ type: 'in', ax: 9, ay: 0, run: false, act: false })).toBeNull();
    expect(g.validate({ type: 'in', ax: 0, ay: 0, run: 'yes', act: false })).toBeNull();
    expect(g.validate({ type: 'pass' })).toEqual({ type: 'pass' });
    expect(g.validate({ type: 'pass', to: 'p2' })).toEqual({ type: 'pass', to: 'p2' });
    expect(g.validate({ type: 'pass', to: 7 })).toBeNull();
    expect(g.validate({ type: 'shoot' })).toBeNull();
    const v = JSON.parse(JSON.stringify(setup())) as Record<string, unknown>;
    g.publicView!(v);
    expect(v.seed).toBe(0);
    expect(v.rng).toBe(0);
  });
});
