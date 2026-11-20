/**
 * Toybox Siege balance tables. Pure data: no DOM, no three.js, no colours (see `look.ts`).
 * The rules core (`rules.ts`), the bots and the README all read these, so a balance change
 * happens in exactly one place. Every number here is provisional (see README.md).
 *
 * Units: centimetres, milliseconds, cm/s. One board is a square ARENA_HALF × 2 on a side.
 */

export type ClassId = 'warrior' | 'ranger' | 'mage';
export type WeaponId = 'sweep' | 'popgun' | 'chime' | 'yoyo' | 'planes' | 'marbles';
export type PassiveId = 'plating' | 'crayon' | 'mainspring' | 'magnifier' | 'gears' | 'magnet';
export type EliteId = 'bear' | 'drummer' | 'rhino';
export type BigId = EliteId | 'baron';

export const CLASS_IDS: readonly ClassId[] = ['warrior', 'ranger', 'mage'];
export const WEAPON_IDS: readonly WeaponId[] = ['sweep', 'popgun', 'chime', 'yoyo', 'planes', 'marbles'];
export const PASSIVE_IDS: readonly PassiveId[] = ['plating', 'crayon', 'mainspring', 'magnifier', 'gears', 'magnet'];

/** Every weapon and passive tops out here. */
export const MAX_LEVEL = 5;
/** Slots: a run holds at most this many different weapons / passives. */
export const MAX_WEAPONS = 4;
export const MAX_PASSIVES = 4;
/** The Rally Horn active skill (send an elite) has its own three levels. */
export const HORN_MAX = 3;

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
  ranger: { id: 'ranger', name: 'Pop-Gun Ranger', role: 'Ranger · fast', blurb: 'Pops corks at the nearest enemy. Quickest on its feet and pulls in gems from further away.',
    weapon: 'popgun', hp: 100, speed: 11.6, armour: 0, cdMul: 1, areaMul: 1, pickupMul: 1.35 },
  mage: { id: 'mage', name: 'Clockwork Wizard', role: 'Mage · area', blurb: 'Rings chime bursts that blast a whole patch of the swarm. Bigger blasts, quicker spells, fragile.',
    weapon: 'chime', hp: 105, speed: 10, armour: 0, cdMul: 0.9, areaMul: 1.15, pickupMul: 1 },
};

/**
 * One row of a weapon table. Not every field matters to every weapon:
 *  sweep: area = reach, arc = degrees per swing, count = swings (1 front, 2 front + back)
 *  popgun: count = corks per volley, pierce = extra enemies a cork passes through, speed, range = lifetime ms
 *  chime: count = bursts, area = blast radius, range = how far it looks for a target
 *  yoyo: count = yo-yos, area = orbit radius, speed = radians per second, cd = per-enemy hit gap
 *  planes: count = planes, range = how far out before they turn back, speed
 *  marbles: count = marbles per shower, area = splash radius, range = how far it looks for targets
 */
export interface WeaponStats { cd: number; dmg: number; count: number; area: number; arc: number; speed: number; pierce: number; range: number; knock: number }
export interface WeaponDef { id: WeaponId; name: string; blurb: string; levels: WeaponStats[]; evolved: WeaponStats; evolvedName: string; evolvedBlurb: string; partner: PassiveId; levelText: string[] }

const w = (cd: number, dmg: number, count: number, area: number, extra: Partial<WeaponStats> = {}): WeaponStats =>
  ({ cd, dmg, count, area, arc: 0, speed: 0, pierce: 0, range: 0, knock: 0, ...extra });

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  sweep: { id: 'sweep', name: 'Bayonet Sweep', blurb: 'A wide swing in front of you that shoves enemies back.', partner: 'plating',
    levels: [w(1150, 14, 1, 6, { arc: 150, knock: 9 }), w(1150, 20, 1, 6, { arc: 150, knock: 9 }), w(1100, 20, 2, 6, { arc: 150, knock: 9 }), w(1100, 24, 2, 7.5, { arc: 150, knock: 10 }), w(950, 32, 2, 7.5, { arc: 150, knock: 10 })],
    levelText: ['', '+6 damage', 'Also swings behind you', '+25% reach', '+8 damage, swings faster'],
    evolved: w(850, 44, 1, 9.5, { arc: 360, knock: 14 }), evolvedName: 'Whirling Brigade', evolvedBlurb: 'A full circle of bayonets, every swing.' },
  popgun: { id: 'popgun', name: 'Pop-Gun', blurb: 'Fires corks at the nearest enemy.', partner: 'gears',
    levels: [w(750, 9, 1, 0.6, { speed: 42, range: 800 }), w(750, 9, 2, 0.6, { speed: 42, range: 800 }), w(720, 10, 2, 0.6, { speed: 42, range: 800, pierce: 1 }),
      w(700, 15, 2, 0.6, { speed: 42, range: 800, pierce: 1 }), w(600, 15, 3, 0.6, { speed: 42, range: 850, pierce: 1 })],
    levelText: ['', '+1 cork', 'Corks pass through one enemy', '+5 damage', '+1 cork, fires faster'],
    evolved: w(230, 16, 2, 0.7, { speed: 56, range: 850, pierce: 3 }), evolvedName: 'Cork Gatling', evolvedBlurb: 'A rattling stream of corks that punch through three enemies.' },
  chime: { id: 'chime', name: 'Chime Burst', blurb: 'A ringing blast lands on an enemy near you.', partner: 'magnifier',
    levels: [w(1600, 16, 1, 4.5, { range: 20 }), w(1600, 18, 1, 5.5, { range: 20 }), w(1550, 18, 2, 5.5, { range: 20 }), w(1500, 26, 2, 5.5, { range: 22 }), w(1300, 26, 3, 6, { range: 22 })],
    levelText: ['', 'Bigger blast', '+1 burst', '+8 damage', '+1 burst, rings faster'],
    evolved: w(1150, 36, 4, 7.5, { range: 24 }), evolvedName: 'Grand Carillon', evolvedBlurb: 'Four great bells toll at once.' },
  yoyo: { id: 'yoyo', name: 'Yo-Yo Orbit', blurb: 'Yo-yos circle you and clip anything they touch.', partner: 'mainspring',
    levels: [w(450, 8, 1, 5.5, { speed: 3.2 }), w(450, 8, 2, 5.5, { speed: 3.2 }), w(450, 13, 2, 5.5, { speed: 3.4 }), w(450, 13, 3, 6.5, { speed: 3.4 }), w(400, 18, 3, 6.5, { speed: 4.6 })],
    levelText: ['', '+1 yo-yo', '+5 damage', '+1 yo-yo, wider orbit', '+5 damage, spins faster'],
    evolved: w(350, 24, 5, 8, { speed: 5 }), evolvedName: 'Yo-Yo Cyclone', evolvedBlurb: 'Five yo-yos whirl round you in a wide storm.' },
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

export const HORN = { name: 'Rally Horn', blurb: 'Active skill: send an elite to a rival’s board.', cooldowns: [75000, 60000, 45000], firstReadyMs: 8000, offerChance: 0.4, offerFromLevel: 4 };

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

// ---------------------------------------------------------------- the match

export interface SiegeConfig {
  /** Run length after the class pick (the clock players see). */
  durationMs: number;
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
