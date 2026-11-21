/**
 * Toybox Siege balance tables. Pure data: no DOM, no three.js, no colours (see `look.ts`).
 * The rules core (`rules.ts`), the bots and the README all read these, so a balance change
 * happens in exactly one place. Every number here is provisional (see README.md).
 *
 * Units: centimetres, milliseconds, cm/s. One board is a square ARENA_HALF × 2 on a side.
 */

export type ClassId = 'warrior' | 'ranger' | 'mage';
export type WeaponId = 'sweep' | 'popgun' | 'spark' | 'yoyo' | 'planes' | 'marbles';
export type PassiveId = 'plating' | 'crayon' | 'mainspring' | 'magnifier' | 'gears' | 'magnet';
export type EliteId = 'bear' | 'drummer' | 'rhino';
export type BigId = EliteId | 'baron';

export const CLASS_IDS: readonly ClassId[] = ['warrior', 'ranger', 'mage'];
export const WEAPON_IDS: readonly WeaponId[] = ['sweep', 'popgun', 'spark', 'yoyo', 'planes', 'marbles'];
export const PASSIVE_IDS: readonly PassiveId[] = ['plating', 'crayon', 'mainspring', 'magnifier', 'gears', 'magnet'];

/** Every weapon and passive tops out here. */
export const MAX_LEVEL = 5;
/** Slots: a run holds at most this many different weapons / passives. */
export const MAX_WEAPONS = 4;
export const MAX_PASSIVES = 4;
/** The Rally Horn active skill (send an elite) has its own three levels. */
export const HORN_MAX = 3;
/**
 * The Ranger's corks (owner redesign, 21 Nov 2026): a volley picks the nearest enemies within
 * `acquire` cm (one cork each); after each hit a cork hops on to the nearest enemy within `hop` cm
 * that it has not hit yet. The Prism Ray's beams chain the same way, instantly.
 */
export const RANGER = { acquire: 30, hop: 12, beamLife: 200 } as const;

export const ARENA_HALF = 44;
export const PLAYER_RADIUS = 1.1;
export const BASE_PICKUP = 4.5;

export interface ClassDef {
  id: ClassId;
  name: string;
  /** Short role line for the class card. */
  role: string;
  blurb: string;
  weapon: WeaponId;
  hp: number;
  /** cm/s */
  speed: number;
  /** Flat damage taken off every hit (minimum 1 damage gets through). */
  armour: number;
  cdMul: number;
  areaMul: number;
  pickupMul: number;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: { id: 'warrior', name: 'Tin Soldier', role: 'Warrior · tough', blurb: 'Sweeps its bayonet round in a wide arc. Most health, built-in armour, a little slow.',
    weapon: 'sweep', hp: 150, speed: 9.2, armour: 2, cdMul: 1, areaMul: 1, pickupMul: 1 },
  ranger: { id: 'ranger', name: 'Pop-Gun Ranger', role: 'Ranger · fast', blurb: 'Pops a cork at each of the three nearest enemies; each cork hops on to the next. Quickest on its feet and pulls in gems from further away.',
    weapon: 'popgun', hp: 115, speed: 11.6, armour: 0, cdMul: 1, areaMul: 1, pickupMul: 1.35 },
  mage: { id: 'mage', name: 'Clockwork Wizard', role: 'Mage · area', blurb: 'Casts chain lightning that leaps from enemy to enemy. Longer leaps, quicker spells, fragile.',
    weapon: 'spark', hp: 105, speed: 10, armour: 0, cdMul: 0.9, areaMul: 1.15, pickupMul: 1 },
};

/**
 * One row of a weapon table. Not every field matters to every weapon:
 *  sweep: area = reach, arc = degrees per swing, count = swings (1 front, 2 front + back)
 *  popgun: count = corks per volley (one at each of the nearest enemies), pierce = hops (after a hit a cork flies on to the
 *          nearest enemy it has not hit, this many times), area = cork radius, speed, range = lifetime ms.
 *          Evolved (the Prism Ray): count = beams, pierce = hops, area = beam half-width (looks only), range = reach of the first hit (cm)
 *  spark: chain lightning. count = bolts (1), pierce = bounces, area = bounce reach (cm, × area), range = reach of the first hit
 *          (evolved: also SKY strikes)
 *  yoyo: count = yo-yos, area = orbit radius, speed = radians per second, cd = per-enemy hit gap (evolved: also the AURA)
 *  planes: count = planes, range = how far out before they turn back, speed
 *  marbles: count = marbles per shower, area = splash radius, range = how far it looks for targets
 */
export interface WeaponStats { cd: number; dmg: number; count: number; area: number; arc: number; speed: number; pierce: number; range: number; knock: number }
export interface WeaponDef { id: WeaponId; name: string; blurb: string; levels: WeaponStats[]; evolved: WeaponStats; evolvedName: string; evolvedBlurb: string; partner: PassiveId; levelText: string[] }

const w = (cd: number, dmg: number, count: number, area: number, extra: Partial<WeaponStats> = {}): WeaponStats =>
  ({ cd, dmg, count, area, arc: 0, speed: 0, pierce: 0, range: 0, knock: 0, ...extra });

/** The Pop-Gun's levels: corks per volley (count) and hops (pierce) grow; damage per cork stays small. */
const POP: WeaponStats[] = [
  w(1000, 8, 3, 0.6, { speed: 42, range: 900, pierce: 1 }), w(1000, 8, 4, 0.6, { speed: 42, range: 900, pierce: 1 }), w(950, 10, 4, 0.6, { speed: 42, range: 900, pierce: 2 }),
  w(900, 12, 5, 0.6, { speed: 42, range: 900, pierce: 2 }), w(800, 14, 5, 0.6, { speed: 44, range: 900, pierce: 3 }),
];

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  sweep: { id: 'sweep', name: 'Bayonet Sweep', blurb: 'A wide swing in front of you that shoves enemies back.', partner: 'plating',
    levels: [w(1150, 14, 1, 6, { arc: 150, knock: 9 }), w(1150, 20, 1, 6, { arc: 150, knock: 9 }), w(1100, 20, 2, 6, { arc: 150, knock: 9 }), w(1100, 24, 2, 7.5, { arc: 150, knock: 10 }), w(950, 32, 2, 7.5, { arc: 150, knock: 10 })],
    levelText: ['', '+6 damage', 'Also swings behind you', '+25% reach', '+8 damage, swings faster'],
    evolved: w(850, 44, 1, 9.5, { arc: 360, knock: 14 }), evolvedName: 'Whirling Brigade', evolvedBlurb: 'A full circle of bayonets, every swing.' },
  // Owner redesign (21 Nov 2026): three corks a volley, one at each of the three nearest enemies; each cork hits one
  // enemy, then hops to the nearest one it has not hit. Levels add corks and hops. The secret upgrade (one more of
  // each) turns them into instant beams that chain from enemy to enemy.
  popgun: { id: 'popgun', name: 'Pop-Gun', blurb: 'A cork at each of the three nearest enemies; each hits one, then hops to the next nearest.', partner: 'gears',
    levels: [POP[0], POP[1], POP[2], POP[3], POP[4]],
    levelText: ['', '+1 cork (4 a volley)', 'Corks hop on twice, +2 damage', '+1 cork (5 a volley), +2 damage', 'Corks hop on three times, +2 damage, fires faster'],
    evolved: w(750, 20, POP[4].count + 1, 0.3, { range: RANGER.acquire, pierce: POP[4].pierce + 1, knock: 2 }), evolvedName: 'Prism Ray',
    evolvedBlurb: `Six instant laser beams: each strikes one of the nearest enemies, then chains on to the next nearest, ${POP[4].pierce + 1} times.` },
  // Owner redesign (21 Nov 2026): chain lightning replaces the meteors. Levels add bounces, cast speed and damage; the
  // secret upgrade adds lightning strikes from the sky (SKY).
  spark: { id: 'spark', name: 'Chain Lightning', blurb: 'Lightning strikes the nearest enemy, then leaps on to the next nearest it has not struck.', partner: 'magnifier',
    levels: [w(1000, 18, 1, 6, { range: 18, pierce: 3, knock: 1 }), w(1000, 18, 1, 6, { range: 18, pierce: 5, knock: 1 }), w(900, 26, 1, 6, { range: 18, pierce: 5, knock: 1 }),
      w(900, 26, 1, 7, { range: 20, pierce: 7, knock: 1 }), w(750, 34, 1, 7, { range: 20, pierce: 9, knock: 1 })],
    levelText: ['', '+2 bounces (strikes 6 enemies)', '+8 damage, casts faster', '+2 bounces (8 enemies), leaps further', '+8 damage, +2 bounces (10 enemies), casts faster'],
    evolved: w(650, 40, 1, 8, { range: 22, pierce: 12, knock: 1 }), evolvedName: 'Thunderhead',
    evolvedBlurb: 'The lightning strikes 13 enemies, and bolts fall from the sky every 1.3 s, shocking everything around where they land.' },
  yoyo: { id: 'yoyo', name: 'Yo-Yo Orbit', blurb: 'Yo-yos circle you and clip anything they touch.', partner: 'mainspring',
    levels: [w(450, 8, 1, 5.5, { speed: 3.2 }), w(450, 8, 2, 5.5, { speed: 3.2 }), w(450, 13, 2, 5.5, { speed: 3.4 }), w(450, 13, 3, 6.5, { speed: 3.4 }), w(400, 18, 3, 6.5, { speed: 4.6 })],
    levelText: ['', '+1 yo-yo', '+5 damage', '+1 yo-yo, wider orbit', '+5 damage, spins faster'],
    // Owner redesign (21 Nov 2026): the secret upgrade keeps the level-5 yo-yos and adds a damage AURA round the toy.
    evolved: w(400, 18, 3, 6.5, { speed: 4.6 }), evolvedName: 'Yo-Yo Cyclone', evolvedBlurb: 'Your yo-yos keep spinning, and a whirlwind round you grinds down every enemy inside it.' },
  planes: { id: 'planes', name: 'Paper Planes', blurb: 'Planes glide out the way you face, then loop back. They pass through everything.', partner: 'magnet',
    levels: [w(1500, 10, 1, 0.9, { speed: 26, range: 14 }), w(1500, 10, 2, 0.9, { speed: 26, range: 14 }), w(1450, 16, 2, 0.9, { speed: 26, range: 15 }),
      w(1400, 16, 3, 0.9, { speed: 26, range: 15 }), w(1200, 20, 3, 0.9, { speed: 28, range: 20 })],
    levelText: ['', '+1 plane', '+6 damage', '+1 plane', 'Fly further, launch faster'],
    evolved: w(1000, 24, 6, 1.1, { speed: 30, range: 22 }), evolvedName: 'Origami Squadron', evolvedBlurb: 'Six planes fan out in every direction.' },
  marbles: { id: 'marbles', name: 'Marble Rain', blurb: 'Marbles drop out of the sky onto enemies around you.', partner: 'crayon',
    levels: [w(2400, 18, 3, 2.4, { range: 20 }), w(2400, 18, 5, 2.4, { range: 20 }), w(2300, 26, 5, 2.6, { range: 20 }), w(2200, 26, 7, 2.6, { range: 22 }), w(1900, 30, 8, 3.4, { range: 22 })],
    levelText: ['', '+2 marbles', '+8 damage', '+2 marbles', 'Bigger splash, falls faster'],
    evolved: w(1600, 36, 14, 3.8, { range: 24 }), evolvedName: 'Marble Avalanche', evolvedBlurb: 'Fourteen marbles at a time. Bring a bucket.' },
};

export interface PassiveDef { id: PassiveId; name: string; perLevel: string }
export const PASSIVES: Record<PassiveId, PassiveDef> = {
  plating: { id: 'plating', name: 'Tin Plating', perLevel: '+1 armour and +12 max health per level' },
  crayon: { id: 'crayon', name: 'Sharp Crayon', perLevel: '+10% damage per level' },
  mainspring: { id: 'mainspring', name: 'Tight Mainspring', perLevel: '−8% weapon cooldowns per level' },
  magnifier: { id: 'magnifier', name: 'Magnifying Glass', perLevel: '+10% weapon area per level' },
  gears: { id: 'gears', name: 'Fast Gears', perLevel: '+8% move speed and +10% projectile speed per level' },
  magnet: { id: 'magnet', name: 'Magnet Button', perLevel: '+35% pickup reach and +4% experience per level' },
};
export const PASSIVE_PER_LEVEL = { armour: 1, hp: 12, dmg: 0.1, cd: 0.08, area: 0.1, speed: 0.08, projSpeed: 0.1, pickup: 0.35, xp: 0.04 } as const;

export const HORN = { name: 'Rally Horn', blurb: 'Active skill: send an elite to a rival’s board. In the final arena it summons a boss to fight for you.', cooldowns: [75000, 60000, 45000], firstReadyMs: 8000, offerChance: 0.4, offerFromLevel: 4 };

/** Anything with a secret upgrade: the six weapons, and the Rally Horn. */
export type EvoId = WeaponId | 'horn';

/**
 * Thunderhead (Chain Lightning's secret upgrade, owner request 21 Nov 2026): on top of the chain, every `every` ms
 * `count` bolts fall from the sky, each on a random enemy within `range` (so mostly where the swarm is thickest),
 * shocking everything within `radius` (× area) for `dmg` (× damage). In the arena they fall on rivals.
 */
export const SKY = { every: 1300, count: 4, radius: 4.5, dmg: 50, range: 20, life: 360 } as const;

/**
 * Yo-Yo Cyclone (the Yo-Yo's secret upgrade, owner request 21 Nov 2026): the yo-yos keep orbiting, and a whirlwind
 * of `radius` (× area) round the toy hurts every enemy inside it for `dmg` (× damage) every `tickMs`.
 */
export const AURA = { radius: 7, tickMs: 300, dmg: 12 } as const;

/**
 * The Rally Horn's secret upgrade (owner request, 20 Nov 2026): a maxed horn (level 3) plus a chest turns
 * it into the Boiler Heart. The toy then fires a ring of rivets all around itself, like the Boiler
 * Baron's bullet rings, every `cd` ms, on top of its weapons (it takes no weapon slot), and the horn
 * keeps its active skill. Each volley's ring turns by half a gap, so the gaps sweep. Pierce 1.
 */
export const BOILER = { name: 'Boiler Heart', blurb: 'Your toy vents a ring of rivets all around itself, like the Boiler Baron, and the horn still sends elites.',
  cd: 1500, count: 16, dmg: 18, speed: 22, lifeMs: 1000, pierce: 1, r: 0.75 } as const;

// ---------------------------------------------------------------- the swarm

export interface MobDef { name: string; hp: number; speed: number; dmg: number; r: number; xp: number; pts: number; from: number; weight: (runMs: number) => number }
export const MOB_KINDS = ['bunny', 'mouse', 'marble', 'plane'] as const;
export type MobKind = typeof MOB_KINDS[number];
export const MOBS: MobDef[] = [
  { name: 'Dust bunny', hp: 7, speed: 4.4, dmg: 6, r: 0.85, xp: 1, pts: 1, from: 0, weight: () => 1 },
  { name: 'Wind-up mouse', hp: 5, speed: 7.2, dmg: 5, r: 0.7, xp: 1, pts: 1, from: 30000, weight: t => Math.min(0.9, (t - 30000) / 60000) },
  { name: 'Rolling marble', hp: 18, speed: 9, dmg: 9, r: 0.95, xp: 2, pts: 2, from: 90000, weight: t => Math.min(0.7, (t - 90000) / 80000) },
  { name: 'Paper plane', hp: 7, speed: 8.5, dmg: 6, r: 0.8, xp: 2, pts: 2, from: 150000, weight: t => Math.min(0.8, (t - 150000) / 60000) },
];
/** Enemy health grows over the run. */
export const hpScale = (runMs: number) => 1 + 0.6 * runMs / 60000;
/** Enemy bites hurt more over the run. */
export const dmgScale = (runMs: number) => 1 + 0.15 * runMs / 60000;
/** New enemies per second (before the cap). Halved while the boss is up. */
export const spawnRate = (runMs: number) => 1.5 + 0.07 * runMs / 1000;
/** Every WAVE_MS a ring of enemies closes in at once. */
export const WAVE_MS = 25000;
export const waveSize = (runMs: number) => 8 + Math.floor(runMs / 10000);
/** Enemies appear this far from the player (just outside the view), inside the board. */
export const SPAWN_DIST: [number, number] = [25, 29];
/** Chance a defeated enemy drops a biscuit (heals SNACK_HEAL of max health). */
export const SNACK_CHANCE = 0.012;
export const SNACK_HEAL = 0.2;

// ---------------------------------------------------------------- elites and the boss

export interface BigDef {
  name: string; hp: number; speed: number; dmg: number; r: number; xp: number; pts: number;
  /** Charge: wind-up then a straight dash (0 = never). */
  dashEvery: number; windup: number; dashMs: number; dashSpeed: number;
  /** Bullet ring (0 = never). */
  ringEvery: number; ringCount: number; ringSpeed: number; ringDmg: number;
  /** Summons wind-up mice (0 = never). */
  summonEvery: number; summonCount: number;
}
const big = (d: Partial<BigDef> & Pick<BigDef, 'name' | 'hp' | 'speed' | 'dmg' | 'r' | 'xp' | 'pts'>): BigDef =>
  ({ dashEvery: 0, windup: 0, dashMs: 0, dashSpeed: 0, ringEvery: 0, ringCount: 0, ringSpeed: 0, ringDmg: 0, summonEvery: 0, summonCount: 0, ...d });
export const BIGS: Record<BigId, BigDef> = {
  bear: big({ name: 'Rag Bear', hp: 420, speed: 5.2, dmg: 14, r: 2.2, xp: 20, pts: 60, dashEvery: 3800, windup: 900, dashMs: 550, dashSpeed: 30 }),
  drummer: big({ name: 'Tin Drummer', hp: 1000, speed: 4.2, dmg: 16, r: 2.0, xp: 30, pts: 80, ringEvery: 2800, ringCount: 10, ringSpeed: 13, ringDmg: 10 }),
  rhino: big({ name: 'Ratchet Rhino', hp: 2000, speed: 5.4, dmg: 20, r: 2.5, xp: 40, pts: 100, dashEvery: 4200, windup: 800, dashMs: 600, dashSpeed: 36, summonEvery: 9000, summonCount: 4 }),
  baron: big({ name: 'The Boiler Baron', hp: 6500, speed: 4.4, dmg: 24, r: 3.4, xp: 0, pts: 600, dashEvery: 8000, windup: 1100, dashMs: 700, dashSpeed: 30, ringEvery: 2600, ringCount: 16, ringSpeed: 12, ringDmg: 12 }),
};
/** One elite per minute, each dropping a treasure chest; the boss arrives at 4:00. */
export const ELITE_SCHEDULE: { at: number; elite: EliteId }[] = [{ at: 60000, elite: 'bear' }, { at: 120000, elite: 'drummer' }, { at: 180000, elite: 'rhino' }];
export const BOSS_AT = 240000;
/** The boss summons a ring of mice as it drops below each fraction of its health. */
export const BOSS_SUMMON_AT = [2 / 3, 1 / 3];
export const BOSS_SUMMON_COUNT = 10;
/** Which elite a rival's horn sends depends on the clock. */
export const sentEliteFor = (runMs: number): EliteId => runMs < 120000 ? 'bear' : runMs < 180000 ? 'drummer' : 'rhino';
/** Elites sent by a rival are a little weaker and drop a big gem, not a chest. */
export const SENT_HP = 0.85;
export const SENT_GEM_XP = 25;

// ---------------------------------------------------------------- levels and points

/** Experience needed to go from `level` to `level + 1`. */
export const xpToNext = (level: number) => 5 + 3 * (level - 1) + Math.floor(0.3 * (level - 1) ** 2);
export const POINTS = { levelUp: 5, victory: 300 } as const;
/** Revive: once per run, paid from your points. */
export const reviveCost = (runMs: number) => 100 + Math.floor(runMs / 1000);

// ---------------------------------------------------------------- the finale

/**
 * The finale (owner request, 20 Nov 2026). Slaying the Boiler Baron drops BOSS_CHESTS chests,
 * pulls every gem and chest on the board to the toy and clears the board; the toy then has
 * `prepMs` to take its cards. At `durationMs` (5:00) everyone still fighting is pulled out the
 * same way (no chests). The arena opens for every toy still in once all of them have finished
 * their prep, and at the latest `prepMs` after 5:00. There, all the toys fight each other with
 * their builds; the last toy standing wins. Every number is provisional.
 */
export const FINALE = {
  /** Treasure chests the boss drops. */
  bossChests: 3,
  /** How fast gems and chests fly to the toy after the boss falls (cm/s). */
  vacuumSpeed: 60,
  /** The arena is a square of this half-size (cm), smaller than a board so rivals meet. */
  half: 22,
  /** Toys start on a ring of this radius, facing the middle. */
  startRadius: 14,
  /** Weapon damage against toys and summoned bosses is the run damage times this. */
  weaponMul: 0.013,
  /** Each point of armour takes this fraction off arena damage, up to `armourCap`. */
  armourPct: 0.04, armourCap: 0.4,
  /** Overtime: from `overtimeFrom` ms into the arena, all damage grows by +100% every `overtimeRamp` ms. */
  overtimeFrom: 40000, overtimeRamp: 10000,
  /** Points for knocking a rival out of the arena, and for being the last toy standing. */
  koPoints: 150, championPoints: 300,
  /** The Rally Horn's summoned Boiler Baron, by horn level (1–3). */
  ally: {
    hp: [70, 100, 135], speed: 5.5, scale: 0.6, r: 2.2,
    /** Contact damage (per touch, 0.5 s apart per toy) and its bullet rings. */
    contact: 6, ringEvery: 2600, ringCount: 12, ringSpeed: 12, ringDmg: 2,
    dashEvery: 6500, windup: 900, dashMs: 650, dashSpeed: 28,
    firstReadyMs: 2000, cooldowns: [32000, 26000, 20000],
  },
} as const;

/** Arena damage multiplier at `arenaT` ms (1 before overtime). */
export const overtime = (arenaT: number) => 1 + Math.max(0, arenaT - FINALE.overtimeFrom) / FINALE.overtimeRamp;

// ---------------------------------------------------------------- the match

export interface SiegeConfig {
  /** Run length after the class pick (the clock players see): toys still fighting are pulled out at this time. */
  durationMs: number;
  /** After the boss falls (or at the end of the run), how long a toy has to take its cards before the arena. */
  prepMs: number;
  /** The final arena's hard time limit (overtime makes it rarely matter). */
  arenaMs: number;
  /** How long a downed toy has to choose to revive. */
  reviveWindowMs: number;
  /** 0 = untimed class pick (the default). A server can set a limit; the first class is then picked. */
  pickTimeoutMs: number;
  /** 0 = untimed level-up / treasure cards (the default). A server can set a limit; the first option is then taken. */
  choiceTimeoutMs: number;
  // Sending elites (treasure skip or Rally Horn).
  sendWarnMs: number;
  /** After sending, you cannot send again for this long. */
  sendCooldownMs: number;
  /** After receiving, a board is protected from further sends for this long. */
  receiveCooldownMs: number;
  /** A board never has more than this many sent elites alive or incoming. */
  maxSentAlive: number;
  // Gameplay entity caps, per board.
  mobCap: number;
  projectileCap: number;
  shotCap: number;
  gemCap: number;
  blastCap: number;
  chestCap: number;
  bigCap: number;
}

export const DEFAULT_CONFIG: SiegeConfig = {
  durationMs: 300000,
  prepMs: 15000,
  arenaMs: 90000,
  reviveWindowMs: 12000,
  pickTimeoutMs: 0,
  choiceTimeoutMs: 0,
  sendWarnMs: 3000,
  sendCooldownMs: 25000,
  receiveCooldownMs: 30000,
  maxSentAlive: 2,
  mobCap: 150,
  projectileCap: 96,
  shotCap: 64,
  gemCap: 160,
  blastCap: 40,
  chestCap: 4,
  bigCap: 4,
};
