/**
 * Toybox Siege bots: kite the swarm, hoover up gems, and pick upgrades that build towards an
 * evolution. In the prep window they take their cards and stand still; in the final arena they
 * hold a range that suits their weapons, circle their nearest rival, dodge summoned bosses and
 * blow the Rally Horn when it is ready. Pure (reads the shared state, returns inputs); randomness only from the host's
 * per-bot seeded RNG, so a whole bot match replays exactly from its seed.
 */
import type { BotPolicy } from '../types';
import {
  ARENA_HALF, AURA, CLASS_IDS, FINALE, WEAPONS, len, passiveLevel, reviveCost, standings,
  type Option, type SiegeInput, type SiegePlayer, type SiegeState,
} from './rules';

/** How often a bot re-plans its movement, and how long it takes over a card. */
const PLAN_MS = 100;
const THINK_MS = { easy: 900, normal: 450, hard: 250 } as const;

/** Score an upgrade card for this toy (higher is better). */
export function rateOption(p: SiegePlayer, o: Option, skill: 'easy' | 'normal' | 'hard'): number {
  switch (o.kind) {
    case 'evolve': return 100;
    case 'heal': return p.hp < p.stat.maxHp * 0.5 ? 45 : 10;
    case 'send': return 0; // treasure skips are decided separately
    // Once taken, the horn is worth raising to its top level: that unlocks its secret upgrade (the Boiler Heart).
    case 'horn': return p.horn ? (skill === 'easy' ? 10 : 24 + p.horn.level * 3) : skill === 'hard' ? 30 : skill === 'normal' ? 25 : 8;
    case 'bundle': return 40;
    case 'weapon': {
      const have = p.weapons.find((w) => w.id === o.id);
      if (have) return 30 + have.level * 2;
      return p.weapons.length < 3 ? 26 : 12;
    }
    case 'passive': {
      // Partners of owned weapons first: they unlock evolutions.
      const partner = p.weapons.some((w) => WEAPONS[w.id].partner === o.id);
      const lv = passiveLevel(p, o.id);
      if (o.id === 'plating' && p.hp < p.stat.maxHp * 0.6) return 32;
      return (partner ? 28 : 16) + lv;
    }
  }
}

export function createSiegeBot(): BotPolicy<SiegeState, SiegeInput> {
  const plan = new Map<string, number>();
  const think = new Map<string, number>();
  return {
    decide(s, bot, _dt, rng) {
      const p = s.players.find((x) => x.id === bot.id);
      if (!p || s.phase === 'over') return [];
      const skill = bot.bot ?? 'normal';
      if (s.phase === 'pick') {
        if (p.cls) return [];
        const at = think.get(p.id);
        if (at === undefined) { think.set(p.id, s.t + THINK_MS[skill] + rng() * 600); return []; }
        if (s.t < at) return [];
        return [{ type: 'class', cls: CLASS_IDS[Math.floor(rng() * CLASS_IDS.length)] }];
      }
      if (p.status === 'downed') {
        const at = think.get(p.id) ?? 0;
        if (s.t < at) return [];
        think.set(p.id, s.t + THINK_MS[skill]);
        const keen = skill === 'easy' ? rng() < 0.5 : true;
        return [keen && p.points >= reviveCost(s.runT) ? { type: 'revive' } : { type: 'giveup' }];
      }
      if (p.status === 'ghost' || p.status === 'picking') return [];
      if (p.choice) {
        const at = think.get(p.id) ?? 0;
        if (s.t < at) return [];
        think.set(p.id, s.t + THINK_MS[skill]);
        if (p.choice.kind === 'treasure') {
          const sendIdx = p.choice.options.findIndex((o) => o.kind === 'send');
          const leader = standings(s)[0];
          const mean = skill === 'hard' ? 0.5 : skill === 'normal' ? 0.35 : 0.1;
          if (sendIdx >= 0 && p.choice.options[0].kind !== 'evolve' && leader && leader !== p && rng() < mean) return [{ type: 'choose', index: sendIdx }];
          return [{ type: 'choose', index: 0 }];
        }
        let best = 0, bestScore = -1;
        p.choice.options.forEach((o, i) => {
          const score = rateOption(p, o, skill) + (skill === 'easy' ? rng() * 30 : rng() * 4);
          if (score > bestScore) { bestScore = score; best = i; }
        });
        return [{ type: 'choose', index: best }];
      }
      if (s.t < (plan.get(p.id) ?? 0)) return [];
      plan.set(p.id, s.t + PLAN_MS * (skill === 'easy' ? 2 : 1));
      if (p.status === 'prep') return p.ax || p.ay ? [{ type: 'move', x: 0, y: 0 }] : [];
      if (p.status === 'arena') {
        const out: SiegeInput[] = [arenaSteer(s, p, skill, rng)];
        const mine = s.arena?.bigs.some((g) => g.on && g.from === p.id);
        if (p.horn && !mine && s.arenaT >= p.horn.readyAt && rng() < (skill === 'easy' ? 0.1 : 0.5)) out.push({ type: 'skill' });
        return out;
      }
      if (p.status !== 'alive') return [];
      const out: SiegeInput[] = [steer(p, skill, rng)];
      if (p.horn && s.runT >= p.horn.readyAt && s.runT >= p.sendReadyAt && rng() < (skill === 'easy' ? 0.05 : 0.3)) out.push({ type: 'skill' });
      return out;
    },
  };
}

/** A push away from enemy bullets within 5 cm (into `dodge`). Its own function, so the JIT optimises it on its own. */
const dodge = { x: 0, z: 0 };
function dodgeShots(shots: SiegeState['players'][number]['board']['shots'], x: number, z: number) {
  let vx = 0, vz = 0;
  for (let i = 0; i < shots.length; i++) {
    const sh = shots[i];
    if (!sh.on) continue;
    const dx = x - sh.x, dz = z - sh.z, d2 = dx * dx + dz * dz;
    if (d2 < 25) { const w = 1 / (d2 + 1); vx += dx * w * 4; vz += dz * w * 4; }
  }
  dodge.x = vx; dodge.z = vz;
}

/** Kiting: push away from nearby enemies (harder the closer), circle the swarm, drift to gems and chests, stay off the walls. */
function steer(p: SiegePlayer, skill: 'easy' | 'normal' | 'hard', rng: () => number): SiegeInput {
  const b = p.board, fear = skill === 'easy' ? 6 : skill === 'normal' ? 8.5 : 10;
  let vx = 0, vz = 0, crowdX = 0, crowdZ = 0, crowd = 0;
  for (let i = 0; i < b.mobs.length; i++) {
    const m = b.mobs[i];
    if (!m.on) continue;
    const dx = p.x - m.x, dz = p.z - m.z, d2 = dx * dx + dz * dz;
    if (d2 > 400) continue;
    crowdX += m.x; crowdZ += m.z; crowd++;
    if (d2 > fear * fear) continue;
    const w = 1 / (d2 + 1);
    vx += dx * w * 6; vz += dz * w * 6;
  }
  for (let i = 0; i < b.bigs.length; i++) {
    const g = b.bigs[i];
    if (!g.on) continue;
    const dx = p.x - g.x, dz = p.z - g.z, d = len(dx, dz) || 1, reach = fear + 6;
    if (g.mode === 1 && skill !== 'easy') { // side-step a telegraphed charge
      const side = g.aimX * dz - g.aimZ * dx > 0 ? 1 : -1;
      vx += -g.aimZ * side * 3; vz += g.aimX * side * 3;
    }
    if (d < reach) { const k = (reach - d) / reach; vx += (dx / d) * 3 * k; vz += (dz / d) * 3 * k; }
    // Melee classes still need to get close: lean in when the elite is not charging.
    if (g.mode === 0 && p.cls === 'warrior' && d > g.r + 5 && d < 16) { vx -= (dx / d) * 0.6; vz -= (dz / d) * 0.6; }
  }
  dodgeShots(p.board.shots, p.x, p.z);
  vx += dodge.x; vz += dodge.z;
  // Circle the crowd rather than backing into a corner.
  if (crowd > 3) {
    const cx = crowdX / crowd - p.x, cz = crowdZ / crowd - p.z, cl = len(cx, cz) || 1;
    vx += (-cz / cl) * 0.5; vz += (cx / cl) * 0.5;
  }
  // Treasure first, then the nearest gem.
  let tx = 0, tz = 0, best = skill === 'easy' ? 120 : 260;
  for (let i = 0; i < b.chests.length; i++) { const c = b.chests[i]; if (c.on && (c.x - p.x) ** 2 + (c.z - p.z) ** 2 < 2500) { tx = c.x; tz = c.z; best = -1; } }
  if (best > 0) for (let i = 0; i < b.gems.length; i++) {
    const g = b.gems[i];
    if (!g.on || g.pull) continue;
    const d2 = (g.x - p.x) ** 2 + (g.z - p.z) ** 2;
    if (d2 < best) { best = d2; tx = g.x; tz = g.z; }
  }
  if (tx || tz) { const dx = tx - p.x, dz = tz - p.z, d = len(dx, dz) || 1; vx += (dx / d) * 0.9; vz += (dz / d) * 0.9; }
  // Walls.
  const edge = ARENA_HALF - 10;
  if (p.x > edge) vx -= (p.x - edge) * 0.3; if (p.x < -edge) vx += (-edge - p.x) * 0.3;
  if (p.z > edge) vz -= (p.z - edge) * 0.3; if (p.z < -edge) vz += (-edge - p.z) * 0.3;
  if (skill === 'easy') { vx += (rng() - 0.5) * 0.8; vz += (rng() - 0.5) * 0.8; }
  const l = len(vx, vz);
  if (l < 0.05) return { type: 'move', x: 0, y: 0 };
  // Rules: x right, y forward (= −z).
  return { type: 'move', x: vx / l, y: -vz / l };
}


/** Arena: keep a range that suits the weapons (close for sweeps and yo-yos), circle the nearest rival, dodge summoned bosses and their bullets, stay off the ropes. */
function arenaSteer(s: SiegeState, p: SiegePlayer, skill: 'easy' | 'normal' | 'hard', rng: () => number): SiegeInput {
  let t: SiegePlayer | null = null, best = Infinity;
  for (const q of s.players) if (q !== p && q.status === 'arena') { const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < best) { best = d; t = q; } }
  let vx = 0, vz = 0;
  const top = p.weapons.reduce((a, w) => (w.evolved ? w.level + 2 : w.level) > (a.evolved ? a.level + 2 : a.level) ? w : a, p.weapons[0]);
  const close = !!top && (top.id === 'sweep' || top.id === 'yoyo');
  if (t) {
    const want = close ? 4 : skill === 'easy' ? 8 : 11;
    const dx = t.x - p.x, dz = t.z - p.z, d = len(dx, dz) || 1;
    const push = Math.max(-1, Math.min(1, (d - want) / 4));
    // A per-bot circling direction, from its id, so two bots do not mirror each other.
    const side = p.id.charCodeAt(p.id.length - 1) % 2 ? 1 : -1;
    vx += (dx / d) * push + (-dz / d) * side * 0.7; vz += (dz / d) * push + (dx / d) * side * 0.7;
  }
  const a = s.arena;
  if (a) {
    for (const g of a.bigs) {
      if (!g.on || g.from === p.id) continue;
      const dx = p.x - g.x, dz = p.z - g.z, d = len(dx, dz) || 1;
      if (g.mode === 1 && skill !== 'easy') { const sd = g.aimX * dz - g.aimZ * dx > 0 ? 1 : -1; vx += -g.aimZ * sd * 3; vz += g.aimX * sd * 3; }
      if (d < 9) { const k = (9 - d) / 9; vx += (dx / d) * 2.5 * k; vz += (dz / d) * 2.5 * k; }
    }
    // A rival's Yo-Yo Cyclone whirlwind hurts: stay out of it (unless this toy fights up close itself).
    if (skill !== 'easy' && !close) for (const q of s.players) {
      if (q === p || q.status !== 'arena' || !q.weapons.some((w) => w.id === 'yoyo' && w.evolved)) continue;
      const dx = p.x - q.x, dz = p.z - q.z, d = len(dx, dz) || 1, edge = AURA.radius * q.stat.area + 2;
      if (d < edge) { const k = (edge - d) / edge; vx += (dx / d) * 2.5 * k; vz += (dz / d) * 2.5 * k; }
    }
    if (skill !== 'easy') for (const sh of a.shots) {
      if (!sh.on || s.players[sh.own] === p) continue;
      const dx = p.x - sh.x, dz = p.z - sh.z, d2 = dx * dx + dz * dz;
      if (d2 < 25) { const w = 1 / (d2 + 1); vx += dx * w * 4; vz += dz * w * 4; }
    }
  }
  const edge = FINALE.half - 5;
  if (p.x > edge) vx -= (p.x - edge) * 0.4; if (p.x < -edge) vx += (-edge - p.x) * 0.4;
  if (p.z > edge) vz -= (p.z - edge) * 0.4; if (p.z < -edge) vz += (-edge - p.z) * 0.4;
  if (skill === 'easy') { vx += (rng() - 0.5) * 0.8; vz += (rng() - 0.5) * 0.8; }
  const l = len(vx, vz);
  if (l < 0.05) return { type: 'move', x: 0, y: 0 };
  return { type: 'move', x: vx / l, y: -vz / l };
}
