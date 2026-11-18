import { ROSTER, type PassiveId } from './catalogue';
import type { Battle, Fighter, SquadUnit } from './rules';

const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
export function makeFighters(units: SquadUnit[], side: 0 | 1, passives: readonly PassiveId[]): Fighter[] {
  return units.map(u => {
    const d = ROSTER[u.kind], front = Math.floor(u.cell / 8) < 2;
    const hp = d.hp * 2 ** (u.tier - 1) + (passives.includes('padding') ? 4 : 0) + (front && passives.includes('vanguard') ? 6 : 0);
    return { ...u, side, x: u.cell % 8, z: side === 0 ? 4 + Math.floor(u.cell / 8) : 3 - Math.floor(u.cell / 8), hp, maxHp: hp,
      facing: side === 0 ? Math.PI : 0, armour: d.armour + (passives.includes('polish') ? 1 : 0), shield: passives.includes('bubble') ? 5 : 0,
      poison: 0, stunnedUntil: 0, attacks: 0, bonusDamage: (passives.includes('springs') ? 1 : 0) + (!front && passives.includes('backline') ? 1 : 0),
      range: d.range + (d.range > 1 && passives.includes('sights') ? 1 : 0) };
  });
}
const directions = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
/** Search to an attack square around the target. Only living units are obstacles. */
export function pathStep(unit: Fighter, target: Fighter, live: Fighter[]): { x: number; z: number } | null {
  const queue = [{ x: unit.x, z: unit.z, first: null as { x: number; z: number } | null }];
  const visited = new Set([`${unit.x},${unit.z}`]);
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i]; if (c.first && distance(c, target) <= unit.range) return c.first;
    for (const [dx, dz] of directions) {
      const n = { x: c.x + dx, z: c.z + dz }; const key = `${n.x},${n.z}`;
      if (n.x < 0 || n.x > 7 || n.z < 0 || n.z > 7 || visited.has(key) || live.some(p => p !== unit && p.hp > 0 && p.x === n.x && p.z === n.z)) continue;
      // No diagonal squeezing between two occupied orthogonal squares.
      if (dx && dz && live.some(p => p.hp > 0 && p.x === c.x + dx && p.z === c.z) && live.some(p => p.hp > 0 && p.x === c.x && p.z === c.z + dz)) continue;
      visited.add(key); queue.push({ ...n, first: c.first ?? n });
    }
  }
  return null;
}
function finish(b: Battle) {
  const home = b.fighters.filter(u => u.hp > 0 && u.side === 0), away = b.fighters.filter(u => u.hp > 0 && u.side === 1);
  if (home.length && away.length) return;
  b.done = true; b.outcome = home.length ? 'win' : away.length ? 'loss' : 'draw'; b.health = home.reduce((n, u) => n + u.hp, 0);
}
export function tickBattle(b: Battle) {
  if (b.done) return;
  b.tick++; b.attacks = []; b.damages = [];
  for (const u of b.fighters) if (u.hp > 0 && u.poison > 0) {
    u.hp = Math.max(0, u.hp - 1); u.poison--; b.damages.push({ serial: b.tick * 128 + b.damages.length, unit: u.id, x: u.x, z: u.z, amount: 1 });
  }
  finish(b); if (b.done) return;
  const live = b.fighters.filter(u => u.hp > 0);
  const hits: { source: Fighter; target: Fighter; amount: number; pierce: boolean; primary: boolean }[] = [];
  const heals = new Map<Fighter, number>(); const poison = new Set<Fighter>(), stuns = new Set<Fighter>();
  const moves: { unit: Fighter; x: number; z: number }[] = [];
  for (const u of live) {
    const passives = u.side === 0 ? b.homePassives : b.awayPassives;
    if (b.tick % 4 === 0 && passives.includes('repairs')) heals.set(u, 2);
    if (u.stunnedUntil >= b.tick) continue;
    const enemies = live.filter(e => e.side !== u.side).sort((a, c) => distance(u, a) - distance(u, c) || a.id - c.id);
    const target = enemies.find(e => distance(u, e) <= u.range) ?? enemies.find(e => pathStep(u, e, live));
    if (!target) continue;
    u.facing = Math.atan2(target.x - u.x, target.z - u.z);
    if (distance(u, target) > u.range) { const step = pathStep(u, target, live); if (step) moves.push({ unit: u, ...step }); continue; }
    u.attacks++;
    const def = ROSTER[u.kind]; let amount = def.damage * 2 ** (u.tier - 1) + u.bonusDamage;
    if ((def.ability === 'execute' && target.hp < target.maxHp / 3) || (def.ability === 'fury' && u.attacks % 3 === 0)) amount *= 2;
    if (passives.includes('encore') && u.attacks % 4 === 0) amount += 2;
    hits.push({ source: u, target, amount, pierce: def.ability === 'pierce', primary: true });
    b.attacks.push({ serial: b.tick * 32 + b.attacks.length, from: u.id, to: target.id, kind: u.kind, x: u.x, z: u.z, tx: target.x, tz: target.z });
    if (def.ability === 'poison') poison.add(target);
    if (def.ability === 'stun' && u.attacks % 3 === 0) stuns.add(target);
    if (def.ability === 'heal' && u.attacks % 3 === 0) {
      const ally = live.filter(a => a.side === u.side).sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp || a.id - c.id)[0];
      heals.set(ally, (heals.get(ally) ?? 0) + 4 * u.tier);
    }
    if (def.ability === 'drain' || passives.includes('siphon')) heals.set(u, (heals.get(u) ?? 0) + (def.ability === 'drain' ? Math.max(1, Math.floor(amount / 3)) : 0) + (passives.includes('siphon') ? 1 : 0));
    let extra = enemies.filter(e => e !== target && distance(e, target) <= 1);
    if (def.ability === 'chain') extra = extra.slice(0, 1);
    else if (def.ability === 'pierce') extra = enemies.filter(e => e.x === target.x + Math.sign(target.x - u.x) && e.z === target.z + Math.sign(target.z - u.z)).slice(0, 1);
    else if (def.ability !== 'cleave' && def.ability !== 'splash') extra = [];
    for (const e of extra) hits.push({ source: u, target: e, amount: Math.max(1, Math.floor(amount / 2)), pierce: def.ability === 'pierce', primary: false });
  }
  // One winner per destination, alternating side priority each tick. Dead units never reserve cells.
  const claimed = new Set<string>();
  moves.sort((a, c) => ((a.unit.side + b.tick) % 2) - ((c.unit.side + b.tick) % 2) || a.unit.id - c.unit.id);
  for (const m of moves) { const key = `${m.x},${m.z}`; if (!claimed.has(key)) { claimed.add(key); m.unit.x = m.x; m.unit.z = m.z; } }
  const totals = new Map<Fighter, number>();
  for (const h of hits) {
    const amount = Math.max(1, h.amount - (h.pierce ? 0 : h.target.armour));
    const absorbed = Math.min(h.target.shield, amount); h.target.shield -= absorbed;
    totals.set(h.target, (totals.get(h.target) ?? 0) + amount - absorbed);
  }
  for (const [u, amount] of totals) { u.hp = Math.max(0, u.hp - amount); if (amount) b.damages.push({ serial: b.tick * 128 + b.damages.length, unit: u.id, x: u.x, z: u.z, amount }); }
  for (const u of poison) if (u.hp > 0) u.poison = 3;
  for (const u of stuns) if (u.hp > 0) u.stunnedUntil = b.tick + 1;
  for (const [u, amount] of heals) if (u.hp > 0) u.hp = Math.min(u.maxHp, u.hp + amount);
  finish(b);
}
