/**
 * Toy Tower Tumble catalogue: towers, enemies, waves, odds, costs and quests. Pure data (no DOM,
 * no three.js) so the rules core can run unchanged on the authoritative game server.
 *
 * Every number here is a balance knob. The tables are documented in README.md; balance is
 * provisional until it has been played (see "Unverified" in the README).
 */
import { PALETTE, RARITY } from '../../game/palette';

export const MAX_TIER = 7;

// ─────────────────────────────────────────────── tower families ───────────────────────────────────────────────

/** Five toy lines, one role each. */
export type Family = 'tin' | 'paper' | 'clockwork' | 'rubber' | 'plush';
export const FAMILIES: readonly Family[] = ['tin', 'paper', 'clockwork', 'rubber', 'plush'];
export interface FamilyDef { name: string; role: string; blurb: string; damage: number; cooldownMs: number; range: number }
export const FAMILY: Record<Family, FamilyDef> = {
  tin: { name: 'Tin soldiers', role: 'Single target', blurb: 'Hard-hitting shots at the leading enemy.', damage: 7, cooldownMs: 800, range: 2.4 },
  paper: { name: 'Paper & craft', role: 'Splash', blurb: 'Lobbed paper, crayon and paint that hit everything near the target.', damage: 6, cooldownMs: 1300, range: 2.2 },
  clockwork: { name: 'Clockwork', role: 'Chain', blurb: 'Sparks that jump from enemy to enemy.', damage: 5, cooldownMs: 1000, range: 2.3 },
  rubber: { name: 'Rubber & string', role: 'Slow', blurb: 'Sticky bands, gum and thread that slow enemies down.', damage: 3, cooldownMs: 900, range: 2.2 },
  plush: { name: 'Plush', role: 'Support aura', blurb: 'Cuddly mascots that make nearby towers hit harder and faster.', damage: 3, cooldownMs: 1000, range: 2.0 },
};
/** Damage multiplier per tier (index = tier − 1). Two towers make one of the next tier, so about ×2.2 per tier rewards merging. */
export const TIER_POWER = [1, 2.2, 4.8, 10.5, 23, 50, 110] as const;
/** Tier colours (HUD borders, tower stands, the merge glow): grey, green, blue, purple, gold, coral, white. */
export const TIER_COLOURS = [RARITY.common, RARITY.uncommon, RARITY.rare, RARITY.epic, RARITY.legendary, PALETTE.coral, PALETTE.white] as const;
export const TIER_NAMES = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5', 'Tier 6', 'Tier 7'] as const;

/** Toy Squad's status vocabulary, applied by tower hits. */
export type Ability = 'fury' | 'burn' | 'pierce' | 'multishot' | 'shred' | 'stun' | 'mark' | 'execute';
export const ABILITY_TEXT: Record<Ability, string> = {
  fury: 'Every third shot deals double damage.',
  burn: 'Sets the target alight: 30% of the hit again every second for 3 s (strongest burn wins).',
  pierce: 'Ignores armour.',
  multishot: 'Fires at two enemies at once.',
  shred: 'Each hit strips armour from the target for good.',
  stun: 'Every fourth shot stops the target for 0.6 s. Bosses shrug it off.',
  mark: 'Marked enemies take 25% more damage from every tower for 2.5 s.',
  execute: 'Instantly topples a non-boss enemy below 15% health.',
};
export const ABILITY_NAME: Record<Ability, string> = {
  fury: 'Fury', burn: 'Burn', pierce: 'Pierce', multishot: 'Multishot', shred: 'Shred', stun: 'Stun', mark: 'Mark', execute: 'Execute',
};

export interface TowerDef {
  id: string; name: string; tier: number; family: Family;
  /** Toy Squad model (and attack look) this tower reuses. */
  model: string;
  abilities: Ability[];
  damage: number; cooldownMs: number; range: number;
  /** Paper: blast radius (board units) around the target; full damage inside half of it, 60% beyond. */
  splash: number;
  /** Clockwork: extra enemies the spark jumps to (each jump 75% of the last). */
  chain: number;
  /** Rubber: speed taken away (0–1) for `slowMs`. The strongest slow wins; never more than 60%. */
  slow: number; slowMs: number;
  /** Plush: towers within `aura` (board units) gain `auraDamage` and `auraSpeed` (strongest aura wins, no stacking). */
  aura: number; auraDamage: number; auraSpeed: number;
}
type Entry = [id: string, name: string, family: Family, model: string, abilities?: Ability[]];
/** The roster, by tier. Tier 1 has exactly one tower per family. Names are original to Toybox Trials. */
const ROSTER: Entry[][] = [
  [
    ['tin-sentry', 'Tin Sentry', 'tin', 'soldier'],
    ['paper-popper', 'Paper Popper', 'paper', 'paper-medic'],
    ['spark-bot', 'Spark Bot', 'clockwork', 'robot'],
    ['band-slinger', 'Band Slinger', 'rubber', 'marble-slinger'],
    ['felt-cub', 'Felt Cub', 'plush', 'felt-fox'],
  ],
  [
    ['cork-musketeer', 'Cork Musketeer', 'tin', 'cork-knight', ['fury']],
    ['crayon-mortar', 'Crayon Mortar', 'paper', 'crayon-cannon', ['burn']],
    ['zap-mouse', 'Zap Mouse', 'clockwork', 'clockwork-mouse'],
    ['gum-frog', 'Gum Frog', 'rubber', 'rubber-frog'],
    ['ribbon-mascot', 'Ribbon Mascot', 'plush', 'ribbon-rookie'],
  ],
  [
    ['graphite-lancer', 'Graphite Lancer', 'tin', 'pencil-lancer', ['pierce']],
    ['bead-barrage', 'Bead Barrage', 'paper', 'bead-bomber', ['multishot']],
    ['dynamo-mole', 'Dynamo Mole', 'clockwork', 'magnet-mole', ['shred']],
    ['yo-yo-snare', 'Yo-yo Snare', 'rubber', 'yo-yo-yak', ['stun']],
    ['patchwork-nanny', 'Patchwork Nanny', 'plush', 'patchwork-nurse'],
  ],
  [
    ['chess-cavalier', 'Chess Cavalier', 'tin', 'chess-chevalier', ['mark']],
    ['paint-howitzer', 'Paint-pot Howitzer', 'paper', 'paint-pot-pyro', ['burn']],
    ['arpeggio-engine', 'Arpeggio Engine', 'clockwork', 'music-box-mage', ['stun']],
    ['silk-spinner', 'Silk Spinner', 'rubber', 'silver-spider', ['shred']],
    ['porcelain-warden', 'Porcelain Warden', 'plush', 'porcelain-panda'],
  ],
  [
    ['quill-marshal', 'Quill Marshal', 'tin', 'quill-quarreller', ['execute']],
    ['rivet-rocketeer', 'Rivet Rocketeer', 'paper', 'rivet-raccoon', ['multishot']],
    ['prism-conductor', 'Prism Conductor', 'clockwork', 'prism-princess', ['mark']],
    ['venom-fiddler', 'Venom Fiddler', 'rubber', 'venom-violinist', ['burn']],
    ['sphinx-matron', 'Sphinx Matron', 'plush', 'suture-sphinx', ['mark']],
  ],
  [
    ['rocking-regent', 'Rocking Regent', 'tin', 'royal-rocking-horse', ['fury', 'stun']],
    ['pinwheel-phoenix', 'Pinwheel Phoenix', 'paper', 'phoenix-pinwheel', ['burn', 'multishot']],
    ['aurora-dynamo', 'Aurora Dynamo', 'clockwork', 'aurora-automaton', ['shred', 'mark']],
    ['thread-viper', 'Thread Viper', 'rubber', 'stitch-serpent', ['stun', 'shred']],
    ['star-seamstress', 'Star Seamstress', 'plush', 'celestial-seamstress', ['stun']],
  ],
  [
    ['last-monarch', 'The Last Monarch', 'tin', 'crownless-king', ['execute', 'pierce', 'multishot']],
    ['patchwork-wyrm', 'Patchwork Wyrm', 'paper', 'velvet-dragon', ['burn', 'shred']],
    ['endless-jack', 'Endless Jack', 'clockwork', 'infinity-jack', ['stun', 'mark']],
  ],
];

function makeTower([id, name, family, model, abilities = []]: Entry, tier: number): TowerDef {
  const f = FAMILY[family], k = tier - 1;
  return {
    id, name, tier, family, model, abilities,
    damage: Math.round(f.damage * TIER_POWER[k] * 10) / 10,
    cooldownMs: f.cooldownMs - k * 20,
    range: Math.round((f.range + k * 0.12) * 100) / 100,
    splash: family === 'paper' ? Math.round((0.9 + k * 0.1) * 100) / 100 : 0,
    chain: family === 'clockwork' ? 2 + Math.floor(tier / 2) : 0,
    slow: family === 'rubber' ? Math.round((0.25 + k * 0.05) * 100) / 100 : 0,
    slowMs: family === 'rubber' ? 1800 + k * 150 : 0,
    aura: family === 'plush' ? (tier >= 4 ? 2.3 : 1.5) : 0,
    auraDamage: family === 'plush' ? Math.round((0.12 + k * 0.05) * 100) / 100 : 0,
    auraSpeed: family === 'plush' ? Math.round((0.06 + k * 0.03) * 100) / 100 : 0,
  };
}
export const TOWERS: Record<string, TowerDef> = Object.fromEntries(ROSTER.flatMap((tier, i) => tier.map((e) => [e[0], makeTower(e, i + 1)])));
/** Tower ids per tier (index = tier − 1), in catalogue order. */
export const TIER_POOLS: readonly (readonly string[])[] = ROSTER.map((tier) => tier.map((e) => e[0]));
export const towerTier = (id: string) => TOWERS[id].tier;

// ─────────────────────────────────────────────── economy ───────────────────────────────────────────────

/**
 * Owner revision (21 Nov 2026): 70 → 90, so a player who levels the builder first (50) can still
 * build two towers for round 1.
 */
export const START_GOLD = 90;
export const START_LIVES = 20;
/** Every Build costs the same and places one random tower (usually tier 1). */
export const BUILD_COST = 20;
/** Selling refunds 10 gold per tier: 10, 20, 30 … 70 gold. */
export const sellValue = (tier: number) => 10 * tier;

/** Builder levels 1–6. `cost` is the price of reaching that level. */
export interface BuilderLevel { level: number; cost: number; build: readonly [number, number, number]; lucky: number }
/**
 * Build odds (% tier 1 / tier 2 / tier 3) and the lucky-merge chance (%: a merge jumps two tiers
 * instead of one, never past tier 5). Shown in the HUD as the odds table.
 */
export const BUILDER: readonly BuilderLevel[] = [
  { level: 1, cost: 0, build: [100, 0, 0], lucky: 0 },
  { level: 2, cost: 50, build: [85, 15, 0], lucky: 3 },
  { level: 3, cost: 90, build: [70, 26, 4], lucky: 6 },
  { level: 4, cost: 140, build: [58, 32, 10], lucky: 8 },
  { level: 5, cost: 200, build: [46, 38, 16], lucky: 10 },
  { level: 6, cost: 280, build: [36, 42, 22], lucky: 12 },
];
export const MAX_BUILDER = BUILDER.length;
/** Lucky merges top out at tier 5: tiers 6 and 7 require a same-tier pair from the preceding tier. */
export const LUCKY_CAP = 5;

// ─────────────────────────────────────────────── enemies ───────────────────────────────────────────────

export type EnemyKind = 'walker' | 'beetle' | 'racer' | 'marble' | 'glider' | 'boss';
export interface EnemyDef {
  name: string; blurb: string;
  /** × the wave's base health. */
  hp: number;
  /** Board units per second. */
  speed: number;
  /** Flat armour per hit (× wave), never below 1 damage. */
  armour: number;
  /** Lives lost on a leak. */
  leak: number;
  /** Gold per kill (× the wave's bounty). */
  bounty: number;
  flying: boolean;
}
export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  walker: { name: 'Wind-up Walker', blurb: 'An ordinary clockwork mouse.', hp: 1, speed: 1.6, armour: 0, leak: 1, bounty: 1, flying: false },
  beetle: { name: 'Tin Beetle', blurb: 'Armoured: each hit loses a little damage.', hp: 1.25, speed: 1.3, armour: 0.5, leak: 2, bounty: 1.5, flying: false },
  racer: { name: 'Pull-back Racer', blurb: 'Fast and fragile.', hp: 0.6, speed: 2.7, armour: 0, leak: 1, bounty: 1, flying: false },
  marble: { name: 'Rolling Marble', blurb: 'Comes in swarms.', hp: 0.3, speed: 1.9, armour: 0, leak: 1, bounty: 0.3, flying: false },
  glider: { name: 'Paper Glider', blurb: 'Flies straight across the board.', hp: 0.8, speed: 1.05, armour: 0, leak: 1, bounty: 1, flying: true },
  boss: { name: 'Boss', blurb: 'Huge, slow, armoured. Immune to stun; slows work half as well.', hp: 1, speed: 0.75, armour: 0.5, leak: 5, bounty: 1, flying: false },
};
export interface BossDef { name: string; model: string; hp: number; flying: boolean; reward: string }
/** Bosses on waves 5, 10, 15 and 20. `hp` is × the wave's base health. */
export const BOSSES: Record<number, BossDef> = {
  5: { name: 'Rumble Ram', model: 'ratchet-rhino', hp: 14, flying: false, reward: 'A free random tier-4 tower' },
  10: { name: 'Tin Juggernaut', model: 'brass-behemoth', hp: 18, flying: false, reward: 'A free random tier-5 tower' },
  15: { name: 'Kite Dragon', model: 'glass-griffin', hp: 16, flying: true, reward: 'A free random tier-5 tower and a free builder level' },
  20: { name: 'The Grand Wind-Up', model: 'grandfather-gear', hp: 30, flying: false, reward: 'A free random tier-6 tower and a 500-point bounty' },
};
/** Free random tower tier for toppling each wave's boss (0: none). */
export const BOSS_GIFT_TIER: Record<number, number> = { 5: 4, 10: 5, 15: 5, 20: 6 };

/**
 * The damage check after the final wave: just for fun. It cannot be toppled, has no health bar
 * and costs no lives when it walks off the board; each board's towers simply see how much damage
 * they can pour into one target while it crosses. It never changes placements.
 */
export const DAMAGE_CHECK = { name: 'The Tally Bear', model: 'clockwork-bear', blurb: 'A huge wind-up practice bear: no health bar, costs no lives. How hard can your board hit it?', speed: 0.75, prepMs: 15000, capMs: 60000 } as const;
export const isBossWave = (wave: number) => wave in BOSSES;

/** Base health of one walker on wave `w` (1–20). */
export const waveHp = (w: number) => Math.round((15 * 1.26 ** (w - 1) + 4 * (w - 1)) * (1 + Math.max(0, w - 9) * 0.1));
/** Gold for one walker on wave `w`. */
export const waveBounty = (w: number) => 2 + Math.floor(w / 8);
/** Gold for clearing (surviving) wave `w`. Paid to every player still in, interest-free. */
export const waveBonus = (w: number) => 8 + w;
/** Bosses also pay a big bounty. */
export const bossBounty = (w: number) => 25 + w * 2;

export interface WaveGroup { kind: EnemyKind; count: number; gapMs: number; delayMs?: number }
/** Twenty waves (index = wave − 1). Bosses come with an escort. */
export const WAVES: readonly (readonly WaveGroup[])[] = [
  [{ kind: 'walker', count: 10, gapMs: 900 }],
  [{ kind: 'walker', count: 12, gapMs: 800 }],
  [{ kind: 'racer', count: 12, gapMs: 700 }],
  [{ kind: 'marble', count: 24, gapMs: 350 }],
  [{ kind: 'boss', count: 1, gapMs: 0 }, { kind: 'walker', count: 6, gapMs: 900, delayMs: 1500 }],
  [{ kind: 'beetle', count: 10, gapMs: 900 }],
  [{ kind: 'walker', count: 10, gapMs: 700 }, { kind: 'racer', count: 6, gapMs: 600, delayMs: 3000 }],
  [{ kind: 'glider', count: 12, gapMs: 800 }],
  [{ kind: 'marble', count: 30, gapMs: 300 }],
  [{ kind: 'boss', count: 1, gapMs: 0 }, { kind: 'beetle', count: 5, gapMs: 1000, delayMs: 1500 }],
  [{ kind: 'racer', count: 16, gapMs: 550 }],
  [{ kind: 'beetle', count: 14, gapMs: 800 }],
  [{ kind: 'glider', count: 16, gapMs: 700 }],
  [{ kind: 'walker', count: 10, gapMs: 700 }, { kind: 'racer', count: 8, gapMs: 500, delayMs: 2000 }, { kind: 'glider', count: 4, gapMs: 900, delayMs: 4000 }],
  [{ kind: 'boss', count: 1, gapMs: 0 }, { kind: 'glider', count: 6, gapMs: 900, delayMs: 1500 }],
  [{ kind: 'marble', count: 36, gapMs: 260 }],
  [{ kind: 'beetle', count: 16, gapMs: 700 }],
  [{ kind: 'racer', count: 18, gapMs: 450 }, { kind: 'glider', count: 6, gapMs: 900, delayMs: 2500 }],
  [{ kind: 'beetle', count: 10, gapMs: 800 }, { kind: 'marble', count: 20, gapMs: 300, delayMs: 1000 }],
  [{ kind: 'boss', count: 1, gapMs: 0 }, { kind: 'beetle', count: 6, gapMs: 900, delayMs: 1200 }, { kind: 'racer', count: 6, gapMs: 600, delayMs: 5000 }],
];
export const WAVE_COUNT = WAVES.length;

// ─────────────────────────────────────────────── quests ───────────────────────────────────────────────

export type QuestId = 'collect5' | 'triple2' | 'order1' | 'order2' | 'order3' | 'first6' | 'clean5' | 'album';
export interface QuestDef { title: string; gold: number; lives?: number; builder?: number;
  /** A free random tower of this tier, placed like a boss gift. */
  tower?: number }
/** Quick quests, always on show. Each pays once. `order1–3` targets are picked per match from the seed. */
export const QUESTS: Record<QuestId, QuestDef> = {
  collect5: { title: 'Own all 5 different tier-1 towers at once', gold: 40 },
  triple2: { title: 'Own 3 of the same tier-2 tower', gold: 30, tower: 2 },
  order1: { title: 'Own 3 of the ordered tier-1 tower', gold: 25 },
  order2: { title: 'Own 3 of the ordered tier-2 tower', gold: 30, tower: 3 },
  order3: { title: 'Own 3 of the ordered tier-3 tower', gold: 80, builder: 1 },
  first6: { title: 'Be the first in the lobby to own a tier-6 tower', gold: 150, lives: 5 },
  clean5: { title: 'Clear 5 waves in a row without a leak', gold: 50 },
  album: { title: 'Own a tier-3+ tower of every family at once', gold: 50, tower: 4 },
};
export const QUEST_ORDER: readonly QuestId[] = ['collect5', 'order1', 'triple2', 'order2', 'order3', 'clean5', 'album', 'first6'];
export const questReward = (q: QuestDef) => [`${q.gold} gold`, q.tower ? `a free tier-${q.tower} tower` : '', q.lives ? `${q.lives} lives` : '', q.builder ? 'a free builder level' : ''].filter(Boolean).join(' + ');
