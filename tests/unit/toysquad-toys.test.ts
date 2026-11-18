import { describe, expect, it } from 'vitest';
import { ROSTER } from '../../src/minigames/toysquad/catalogue';
import { TOY_SPECS } from '../../src/minigames/toysquad/models';
import { EFFECT_SPECS, FX_SHAPES, spellLayout } from '../../src/minigames/toysquad/effects';
import { standGeometry, toyGeometry, toyTriangles } from '../../src/minigames/toysquad/toys';
import { RARITIES, RARITY_COLOURS } from '../../src/minigames/toysquad/catalogue';
import { stepCell } from '../../src/minigames/toysquad/board';
import { damageRows, handbookEntries, ownedCopies, ownedSummary, sortTraits, toggleFavourite, traitProgress } from '../../src/minigames/toysquad/info';
import { makeFighters, tickBattle } from '../../src/minigames/toysquad/combat';
import { MAX_COMBAT_VOICES, audibleBattle, combatVoices, eventCue } from '../../src/minigames/toysquad/sounds';
import type { Battle } from '../../src/minigames/toysquad/rules';
import { TRAITS, TRAIT_COLOURS, TRAIT_SYMBOLS } from '../../src/minigames/toysquad/TraitIcon';
import { TRAIT_BONUSES } from '../../src/minigames/toysquad/kits';
import { sellValue, squadRules } from '../../src/minigames/toysquad/rules';
import { PALETTE, RARITY, ROOM } from '../../src/game/palette';

const ids = Object.keys(ROSTER);
const unique = (values: string[]) => new Set(values).size;

describe('Toy Squad toy models', () => {
  it('gives every roster unit its own model spec', () => {
    expect(Object.keys(TOY_SPECS).sort()).toEqual(ids.slice().sort());
    expect(unique(ids.map(id => JSON.stringify(TOY_SPECS[id].parts)))).toBe(ids.length);
    // Distinct silhouettes, not recolours: ignoring colour, the part layout is still unique per toy.
    expect(unique(ids.map(id => JSON.stringify(TOY_SPECS[id].parts.map(p => [p.g, p.p, p.s]))))).toBe(ids.length);
  });
  it('keeps every toy inside one board square, standing on its stand, within the phone triangle budget', () => {
    for (const id of ids) {
      const spec = TOY_SPECS[id];
      expect(spec.parts.length, id).toBeGreaterThanOrEqual(8);
      const geometry = toyGeometry(id); geometry.computeBoundingBox(); const box = geometry.boundingBox!;
      expect(box.min.y, id).toBeGreaterThan(-0.05); expect(box.max.y, id).toBeLessThan(3.75);
      expect(Math.max(-box.min.x, box.max.x), id).toBeLessThan(1.75); expect(Math.max(-box.min.z, box.max.z), id).toBeLessThan(1.95);
      expect(toyGeometry(id), id).toBe(geometry); // cached: one geometry per kind, shared by every instance
      expect(geometry.getAttribute('position').count / 3, id).toBe(toyTriangles(id));
      expect(toyTriangles(id), id).toBeLessThan(3600);
      expect((geometry.getAttribute('position').array as Float32Array).every(Number.isFinite), id).toBe(true);
    }
  });
  it('only uses palette tokens or blends of two of them', () => {
    const tokens = [...Object.values(PALETTE), ...Object.values(ROOM).flat()].map(c => c.toUpperCase());
    const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const blend = (hex: string) => tokens.some(a => tokens.some(b => {
      const [x, y, c] = [channels(a), channels(b), channels(hex)];
      // c = x + (y - x) * t for one t in [0, 1] on all three channels (to rounding)
      const ts = [0, 1, 2].filter(i => Math.abs(x[i] - y[i]) > 8).map(i => (c[i] - x[i]) / (y[i] - x[i]));
      return ts.length > 0 && ts.every(t => t >= -0.02 && t <= 1.02 && Math.abs(t - ts[0]) < 0.06)
        && [0, 1, 2].every(i => Math.abs(x[i] - y[i]) > 8 || Math.abs(c[i] - x[i]) <= 9);
    }));
    const used = new Set(ids.flatMap(id => TOY_SPECS[id].parts.map(p => p.c.toUpperCase())));
    for (const colour of used) expect(tokens.includes(colour) || blend(colour), colour).toBe(true);
  });
});

describe('Toy Squad effect specs', () => {
  it('gives every roster unit its own attack and spell look', () => {
    expect(Object.keys(EFFECT_SPECS).sort()).toEqual(ids.slice().sort());
    const look = (o: object) => JSON.stringify({ ...o, label: undefined });
    expect(unique(ids.map(id => look(EFFECT_SPECS[id].attack)))).toBe(ids.length);
    expect(unique(ids.map(id => look(EFFECT_SPECS[id].spell)))).toBe(ids.length);
    expect(unique(ids.map(id => EFFECT_SPECS[id].attack.label))).toBe(ids.length);
    expect(unique(ids.map(id => EFFECT_SPECS[id].spell.label))).toBe(ids.length);
    for (const id of ids) {
      const { attack, spell } = EFFECT_SPECS[id];
      expect(FX_SHAPES, id).toContain(attack.shape); expect(FX_SHAPES, id).toContain(spell.shape);
      expect(attack.count, id).toBeGreaterThanOrEqual(1); expect(attack.count, id).toBeLessThanOrEqual(3);
      // Melee toys strike at close quarters; they never use a long-range flight path.
      if (ROSTER[id].range === 1) expect(['arc', 'bounce', 'spiral', 'zigzag'], id).not.toContain(attack.path);
    }
  });
  it('lays every spell out from its kit, so each one shows where it lands', () => {
    for (const id of ids) {
      const layout = spellLayout(id), effects = ROSTER[id].spell.effects;
      expect(layout.line || layout.blast > 0 || layout.everyEnemy || layout.single || layout.marked || layout.allies, id).toBe(true);
      expect(layout.line, id).toBe(effects.some(f => f.target === 'line'));
      expect(layout.everyEnemy, id).toBe(effects.some(f => f.target === 'allEnemies'));
      expect(layout.blast, id).toBe(Math.max(0, ...effects.filter(f => f.target === 'nearEnemies').map(f => f.radius ?? 1)));
      expect(layout.aura, id).toBe(Math.max(0, ...effects.filter(f => f.target === 'nearAllies').map(f => f.radius ?? 1)));
    }
    expect(spellLayout('quill-quarreller')).toMatchObject({ line: true, blast: 0, single: false });
    expect(spellLayout('bead-bomber')).toMatchObject({ blast: 2, line: false });
    expect(spellLayout('porcelain-panda')).toMatchObject({ allies: true, blast: 0, single: false });
    expect(spellLayout('crownless-king')).toMatchObject({ single: true, marked: true, allies: true, aura: 2 });
  });
});

describe('Toy Squad rarity colours, selling and keyboard placement', () => {
  it('colour-codes rarity grey, green, blue, purple, yellow, with five distinct colours', () => {
    expect(RARITIES.map(r => RARITY_COLOURS[r])).toEqual([RARITY.common, RARITY.uncommon, RARITY.rare, RARITY.epic, RARITY.legendary]);
    expect(RARITY.uncommon).toBe(PALETTE.sage); expect(RARITY.rare).toBe(PALETTE.toyBlue); expect(RARITY.legendary).toBe(PALETTE.honey);
    expect(new Set(Object.values(RARITY)).size).toBe(5);
    const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const [gr, gg, gb] = rgb(RARITY.common); expect(Math.max(gr, gg, gb) - Math.min(gr, gg, gb)).toBeLessThan(12); // grey
    const [pr, pg, pb] = rgb(RARITY.epic); expect(pb).toBeGreaterThan(pr); expect(pr).toBeGreaterThan(pg); // purple
  });
  it('builds one cached stand per team and rarity, with the rarity colour on it', () => {
    const seen = new Set<unknown>();
    for (const side of [0, 1] as const) for (const rarity of RARITIES) {
      const stand = standGeometry(side, rarity); expect(standGeometry(side, rarity)).toBe(stand); seen.add(stand);
    }
    expect(seen.size).toBe(10);
  });
  it('quotes the same refund the sell command pays', () => {
    expect(sellValue({ kind: 'soldier', tier: 1 })).toBe(1); expect(sellValue({ kind: 'soldier', tier: 3 })).toBe(3);
    expect(sellValue({ kind: 'cap-captain', tier: 2 })).toBe(3); expect(sellValue({ kind: 'infinity-jack', tier: 1 })).toBe(4);
    const s = squadRules.init([{ id: 'a', name: 'A', isBot: false } as never], 7), p = s.players[0];
    p.units = [{ id: 1, kind: 'clockwork-bear', tier: 2, cell: 0 }, { id: 2, kind: 'hare', tier: 1, cell: -1 }];
    for (const unit of p.units.slice()) {
      const coins = p.coins, quote = sellValue(unit);
      squadRules.step(s, { a: [{ type: 'sell', unit: unit.id }] }, 1);
      expect(p.coins - coins).toBe(quote); expect(p.units.some(u => u.id === unit.id)).toBe(false);
    }
  });
  it('steps the selected toy one square, on and off the reserve row', () => {
    expect(stepCell(0, 1, 0)).toBe(1); expect(stepCell(0, -1, 0)).toBeNull(); expect(stepCell(7, 1, 0)).toBeNull();
    expect(stepCell(9, 0, -1)).toBe(1); expect(stepCell(1, 0, -1)).toBeNull(); // cannot step past the front row
    expect(stepCell(9, 0, 1)).toBe(17); expect(stepCell(26, 0, 1)).toBe(-3); // back off the near row → reserve slot below
    expect(stepCell(-3, 0, -1)).toBe(26); expect(stepCell(-3, 0, 1)).toBeNull();
    expect(stepCell(-1, -1, 0)).toBeNull(); expect(stepCell(-1, 1, 0)).toBe(-2); expect(stepCell(-8, 1, 0)).toBeNull();
  });
});

describe('Toy Squad HUD information', () => {
  it('counts owned copies by star tier, including two-star copies', () => {
    const units = [{ kind: 'soldier', tier: 1 }, { kind: 'soldier', tier: 2 }, { kind: 'hare', tier: 2 }, { kind: 'robot', tier: 3 }];
    expect(ownedCopies(units, 'soldier')).toEqual([1, 1, 0]); expect(ownedSummary(ownedCopies(units, 'soldier'))).toBe('1:1,2:1');
    expect(ownedSummary(ownedCopies(units, 'hare'))).toBe('2:1'); expect(ownedSummary(ownedCopies(units, 'robot'))).toBe('3:1');
    expect(ownedCopies(units, 'felt-fox')).toEqual([0, 0, 0]); expect(ownedSummary([0, 0, 0])).toBe('');
  });
  it('tracks trait progress towards the 2 and 4 thresholds and lists active traits first', () => {
    expect([0, 1, 2, 3, 4, 6].map(n => traitProgress(n))).toEqual([{ rank: 0, next: 2 }, { rank: 0, next: 2 }, { rank: 1, next: 4 }, { rank: 1, next: 4 }, { rank: 2, next: null }, { rank: 2, next: null }]);
    expect(sortTraits({ Tin: 1, Wood: 4, Felt: 2, Paper: 0, Medic: 3 }).map(([t]) => t)).toEqual(['Wood', 'Medic', 'Felt', 'Tin']);
  });
  it('gives each of the 11 traits its own symbol and colour, matching the kit traits', () => {
    expect(TRAITS.slice().sort()).toEqual(Object.keys(TRAIT_BONUSES).sort());
    expect(new Set(TRAITS.map(t => TRAIT_SYMBOLS[t])).size).toBe(11); expect(new Set(TRAITS.map(t => TRAIT_COLOURS[t])).size).toBe(11);
    const tokens: string[] = [...Object.values(PALETTE), ...Object.values(RARITY)];
    for (const t of TRAITS) expect(tokens, t).toContain(TRAIT_COLOURS[t]);
  });
  it('lists the whole roster in the handbook, by rarity, with rarity and trait filters', () => {
    const all = handbookEntries();
    expect(all.length).toBe(62); expect(new Set(all).size).toBe(62); expect(all[0]).toBe('soldier'); expect(all[61]).toBe('infinity-jack');
    expect(all.map(id => RARITIES.indexOf(ROSTER[id].rarity))).toEqual(all.map(id => RARITIES.indexOf(ROSTER[id].rarity)).slice().sort((a, b) => a - b));
    expect(handbookEntries('Legendary').length).toBe(7); expect(handbookEntries('Legendary', 'Clockwork')).toEqual(['grandfather-gear', 'infinity-jack']);
    for (const t of TRAITS) { const members = handbookEntries(null, t); expect(members.length, t).toBeGreaterThanOrEqual(4); expect(members.every(id => ROSTER[id].traits.includes(t))).toBe(true); }
  });
  it('toggles a favourite without mutating the saved list', () => {
    const saved = ['hare']; expect(toggleFavourite(saved, 'robot')).toEqual(['hare', 'robot']); expect(toggleFavourite(saved, 'hare')).toEqual([]); expect(saved).toEqual(['hare']);
  });
});

describe('Toy Squad damage overview and sound filtering', () => {
  const arena = (home: string[], away: string[]): Battle => {
    const team = (kinds: string[], side: 0 | 1) => makeFighters(kinds.map((kind, cell) => ({ id: (side ? 100 : 1) + cell, kind, tier: 1, cell })), side, []);
    return { owner: 'a', opponent: 'b', fighters: [...team(home, 0), ...team(away, 1)], done: false, outcome: null, health: 0, attacks: [], damages: [], tick: 0, homePassives: [], awayPassives: [] };
  };
  it('tallies damage dealt and taken per fighter without changing the fight', () => {
    const b = arena(['soldier', 'cork-knight'], ['robot', 'button-brawler']); let shown = 0;
    for (const u of b.fighters) expect(u.stats).toEqual({ dealt: 0, spell: 0, taken: 0 });
    while (!b.done && b.tick < 200) { tickBattle(b); shown += b.damages.reduce((n, d) => n + d.amount, 0); }
    const sum = (f: (u: Battle['fighters'][number]) => number) => b.fighters.reduce((n, u) => n + f(u), 0);
    expect(sum(u => u.stats.taken)).toBe(shown); // exactly the numbers that float over the board
    expect(sum(u => u.stats.dealt)).toBe(shown); // no poison in this fight, so every point has a source
    expect(shown).toBeGreaterThan(0);
    for (const u of b.fighters) { expect(u.stats.spell).toBeLessThanOrEqual(u.stats.dealt); expect(u.stats.taken).toBeGreaterThanOrEqual(u.maxHp - u.hp - 0); }
    expect(sum(u => u.stats.spell)).toBeGreaterThan(0); // spells were cast and counted separately
    // The tally is bookkeeping only: the same fight without reading it ends identically.
    const again = arena(['soldier', 'cork-knight'], ['robot', 'button-brawler']); while (!again.done && again.tick < 200) tickBattle(again);
    expect(again.fighters.map(u => [u.hp, u.x, u.z])).toEqual(b.fighters.map(u => [u.hp, u.x, u.z])); expect(again.outcome).toBe(b.outcome);
  });
  it('counts poison as damage taken with no attacker', () => {
    const b = arena(['rubber-frog'], ['robot']); b.fighters.forEach(u => { u.hp = u.maxHp = 300; }); let shown = 0;
    for (let i = 0; i < 30; i++) { tickBattle(b); shown += b.damages.reduce((n, d) => n + d.amount, 0); }
    const taken = b.fighters.reduce((n, u) => n + u.stats.taken, 0), dealt = b.fighters.reduce((n, u) => n + u.stats.dealt, 0);
    expect(taken).toBe(shown); expect(dealt).toBeLessThan(taken);
  });
  it('orders overview rows high to low', () => {
    const f = (id: number, dealt: number, spell: number, taken: number, hp = 5) => ({ id, kind: 'soldier', tier: 1, hp, stats: { dealt, spell, taken } });
    const rows = [f(3, 10, 4, 1), f(1, 25, 0, 9, 0), f(2, 10, 10, 30)];
    expect(damageRows(rows, 'dealt').map(r => [r.id, r.value, r.spell, r.alive])).toEqual([[1, 25, 0, false], [2, 10, 10, true], [3, 10, 4, true]]);
    expect(damageRows(rows, 'taken').map(r => [r.id, r.value, r.spell])).toEqual([[2, 30, 0], [1, 9, 0], [3, 1, 0]]);
  });
  it('only sounds the local player and caps each combat tick', () => {
    expect(eventCue({ type: 'squad-buy', id: 'me' }, 'me')).toBe('buy'); expect(eventCue({ type: 'squad-buy', id: 'bot-1' }, 'me')).toBeNull();
    expect(eventCue({ type: 'squad-upgrade', id: 'me' }, 'me')).toBe('upgrade'); expect(eventCue({ type: 'squad-upgrade', id: 'bot-2' }, 'me')).toBeNull();
    expect(eventCue({ type: 'squad-battle', round: 1 }, 'me')).toBe('battle'); expect(eventCue({ type: 'squad-recap', round: 1 }, 'me')).toBe('recap'); expect(eventCue({ type: 'squad-build', round: 2 }, 'me')).toBeNull();
    const mine = arena(['soldier'], ['robot']), theirs = { ...arena(['hare'], ['robot']), owner: 'bot-1' };
    expect(audibleBattle([theirs, mine], 'a')).toBe(mine); expect(audibleBattle([theirs], 'a')).toBeUndefined();
    const attacks = (hits: number, spells: number) => [...Array(hits).fill({}), ...Array(spells).fill({ spell: 'x' })];
    expect(combatVoices([])).toEqual([]); expect(combatVoices(attacks(1, 0))).toEqual(['hit']); expect(combatVoices(attacks(3, 0))).toEqual(['hit', 'hit']);
    expect(combatVoices(attacks(0, 4))).toEqual(['spell']); expect(combatVoices(attacks(2, 1))).toEqual(['spell', 'hit', 'hit']); expect(combatVoices(attacks(9, 5))).toEqual(['spell', 'heavy', 'hit']);
    for (let hits = 0; hits <= 20; hits++) for (let spells = 0; spells <= 10; spells++) expect(combatVoices(attacks(hits, spells)).length).toBeLessThanOrEqual(MAX_COMBAT_VOICES);
  });
});
