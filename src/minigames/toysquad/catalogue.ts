import { PALETTE } from '../../game/palette';

export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as const;
export type Rarity = typeof RARITIES[number];
export const SHOP_ODDS = [
  [80, 20, 0, 0, 0], [70, 30, 0, 0, 0], [55, 35, 10, 0, 0], [45, 40, 15, 0, 0],
  [35, 40, 25, 0, 0], [25, 35, 35, 5, 0], [20, 30, 40, 10, 0], [18, 24, 35, 20, 3],
  [15, 21, 30, 28, 6], [12, 18, 28, 32, 10],
] as const;
export type Ability = 'strike' | 'guard' | 'cleave' | 'splash' | 'poison' | 'stun' | 'heal' | 'drain' | 'execute' | 'chain' | 'pierce' | 'fury';
export const ABILITIES: Record<Ability, string> = {
  strike: 'Accurate single-target attacks.', guard: 'Armour reduces each incoming hit (minimum 1).',
  cleave: 'Also hits enemies next to its target for half damage.', splash: 'A blast hits enemies within one square of its target for half damage.',
  poison: 'Hits poison the target for 1 damage on the next 3 combat ticks; refreshes, does not stack.',
  stun: 'Every third attack stuns its target for the next tick.', heal: 'Every third attack also heals the most wounded ally.',
  drain: 'Heals itself for one third of attack damage.', execute: 'Deals double damage to targets below one third health.',
  chain: 'Bounces half damage to one additional nearby enemy.', pierce: 'Ignores armour, and hits one enemy directly behind the target.',
  fury: 'Every third attack deals double damage.',
};
export interface UnitDefinition { name: string; rarity: Rarity; cost: number; hp: number; damage: number; range: number; armour: number; ability: Ability; colour: string; role: string; shape: 'soldier' | 'robot' | 'beast' }
type Entry = [id: string, name: string, hp: number, damage: number, range: number, ability: Ability, shape?: UnitDefinition['shape']];
const groups: Record<Rarity, Entry[]> = {
  Common: [
    ['soldier', 'Tin Soldier', 16, 3, 1, 'strike'], ['robot', 'Wind-up Robot', 24, 2, 1, 'guard', 'robot'],
    ['hare', 'Spring Hare', 10, 2, 3, 'strike', 'beast'], ['button-brawler', 'Button Brawler', 18, 2, 1, 'fury'],
    ['peg-pikeman', 'Peg Pikeman', 14, 3, 2, 'pierce'], ['marble-slinger', 'Marble Slinger', 11, 2, 3, 'chain'],
    ['felt-fox', 'Felt Fox', 12, 3, 1, 'execute', 'beast'], ['thimble-guard', 'Thimble Guard', 26, 1, 1, 'guard', 'robot'],
    ['spool-spinner', 'Spool Spinner', 15, 2, 1, 'cleave', 'robot'], ['paper-medic', 'Paper Medic', 11, 1, 2, 'heal'],
    ['crayon-cannon', 'Crayon Cannon', 10, 2, 3, 'splash', 'robot'], ['rubber-frog', 'Rubber Frog', 14, 2, 2, 'poison', 'beast'],
    ['domino-drummer', 'Domino Drummer', 17, 2, 1, 'stun'], ['clockwork-mouse', 'Clockwork Mouse', 10, 3, 1, 'drain', 'beast'],
    ['cork-knight', 'Cork Knight', 20, 2, 1, 'strike'], ['ribbon-rookie', 'Ribbon Rookie', 13, 2, 2, 'fury'],
  ],
  Uncommon: [
    ['cap-captain', 'Bottle-cap Captain', 24, 4, 1, 'guard'], ['yo-yo-yak', 'Yo-yo Yak', 28, 3, 1, 'cleave', 'beast'],
    ['kite-archer', 'Kite Archer', 15, 3, 4, 'strike'], ['bead-bomber', 'Bead Bomber', 14, 3, 3, 'splash', 'robot'],
    ['stitch-serpent', 'Stitch Serpent', 18, 3, 2, 'poison', 'beast'], ['pencil-lancer', 'Pencil Lancer', 20, 4, 2, 'pierce'],
    ['spring-ram', 'Spring Ram', 25, 3, 1, 'stun', 'beast'], ['patchwork-nurse', 'Patchwork Nurse', 17, 2, 3, 'heal'],
    ['cog-crab', 'Cog Crab', 30, 2, 1, 'guard', 'beast'], ['paper-panther', 'Paper Panther', 17, 5, 1, 'execute', 'beast'],
    ['windmill-imp', 'Windmill Imp', 16, 3, 2, 'fury', 'robot'], ['copper-bat', 'Copper Bat', 16, 4, 1, 'drain', 'beast'],
    ['domino-duellist', 'Domino Duellist', 21, 4, 1, 'strike'], ['magnet-mole', 'Magnet Mole', 20, 3, 2, 'chain', 'beast'],
  ],
  Rare: [
    ['clockwork-bear', 'Clockwork Bear', 38, 4, 1, 'guard', 'beast'], ['music-box-mage', 'Music-box Mage', 21, 4, 4, 'chain'],
    ['jackhammer-jack', 'Jackhammer Jack', 29, 5, 1, 'stun', 'robot'], ['ribbon-ronin', 'Ribbon Ronin', 25, 6, 1, 'cleave'],
    ['paint-pot-pyro', 'Paint-pot Pyro', 22, 4, 3, 'splash', 'robot'], ['porcelain-panda', 'Porcelain Panda', 33, 3, 2, 'heal', 'beast'],
    ['tin-toxin', 'Tin Toxin', 24, 4, 3, 'poison', 'robot'], ['quill-quarreller', 'Quill Quarreller', 19, 6, 4, 'pierce'],
    ['velvet-vampire', 'Velvet Vampire', 24, 5, 2, 'drain'], ['ratchet-rhino', 'Ratchet Rhino', 35, 4, 1, 'fury', 'beast'],
    ['glass-griffin', 'Glass Griffin', 20, 7, 2, 'execute', 'beast'], ['chess-chevalier', 'Chess Chevalier', 30, 5, 1, 'strike'],
    ['lantern-lynx', 'Lantern Lynx', 25, 4, 3, 'stun', 'beast'],
  ],
  Epic: [
    ['brass-behemoth', 'Brass Behemoth', 48, 5, 1, 'guard', 'robot'], ['carousel-chimera', 'Carousel Chimera', 36, 7, 1, 'cleave', 'beast'],
    ['prism-princess', 'Prism Princess', 27, 6, 4, 'chain'], ['rivet-raccoon', 'Rivet Raccoon', 29, 6, 4, 'splash', 'beast'],
    ['suture-sphinx', 'Suture Sphinx', 38, 4, 3, 'heal', 'beast'], ['obsidian-origami', 'Obsidian Origami', 29, 9, 2, 'execute'],
    ['venom-violinist', 'Venom Violinist', 30, 6, 4, 'poison'], ['pendulum-paladin', 'Pendulum Paladin', 42, 6, 1, 'stun'],
    ['silver-spider', 'Silver Spider', 32, 7, 2, 'drain', 'beast'], ['turbine-tiger', 'Turbine Tiger', 35, 7, 1, 'fury', 'beast'],
    ['needle-navigator', 'Needle Navigator', 27, 8, 4, 'pierce'], ['royal-rocking-horse', 'Royal Rocking Horse', 44, 6, 1, 'strike', 'beast'],
  ],
  Legendary: [
    ['grandfather-gear', 'Grandfather Gear', 64, 8, 1, 'guard', 'robot'], ['aurora-automaton', 'Aurora Automaton', 42, 9, 4, 'chain', 'robot'],
    ['phoenix-pinwheel', 'Phoenix Pinwheel', 40, 10, 3, 'splash', 'beast'], ['velvet-dragon', 'Velvet Dragon', 52, 9, 2, 'cleave', 'beast'],
    ['celestial-seamstress', 'Celestial Seamstress', 48, 7, 4, 'heal'], ['crownless-king', 'Crownless King', 55, 11, 1, 'execute'],
    ['infinity-jack', 'Infinity Jack', 46, 10, 3, 'fury', 'robot'],
  ],
};
export const RARITY_COLOURS: Record<Rarity, string> = { Common: PALETTE.cream, Uncommon: PALETTE.sage, Rare: PALETTE.toyBlue, Epic: PALETTE.inkPurple, Legendary: PALETTE.honey };
export const ROSTER: Record<string, UnitDefinition> = Object.fromEntries(RARITIES.flatMap((rarity, i) => groups[rarity].map(([id, name, hp, damage, range, ability, shape]) => [id, {
  name, rarity, cost: i + 1, hp, damage, range, ability, armour: ability === 'guard' ? i + 1 : 0,
  colour: [PALETTE.toyBlue, PALETTE.sage, PALETTE.honey, PALETTE.coral, PALETTE.inkPurple][i],
  role: ABILITIES[ability], shape: shape ?? 'soldier',
}])));
export type UnitKind = string;
export const UNIT_POOLS = RARITIES.map(r => Object.keys(ROSTER).filter(k => ROSTER[k].rarity === r));

export const PASSIVES = {
  padding: { name: 'Felt Padding', description: 'All units gain 4 maximum health.' },
  springs: { name: 'Tight Springs', description: 'All attacks gain 1 damage.' },
  polish: { name: 'Tin Polish', description: 'All units gain 1 armour; each hit still deals at least 1.' },
  sights: { name: 'Button Sights', description: 'Ranged units gain 1 attack range.' },
  repairs: { name: 'Repair Kit', description: 'Every fourth tick, living units recover 2 health.' },
  bubble: { name: 'Bubble Wrap', description: 'Each unit starts every battle with a 5-point shield.' },
  allowance: { name: 'Pocket Money', description: 'Gain 2 extra coins at the start of future rounds.' },
  bargain: { name: 'Bargain Bin', description: 'Shop rerolls cost 1 coin less (minimum 1).' },
  vanguard: { name: 'Wooden Vanguard', description: 'Units deployed in the front two rows gain 6 health.' },
  backline: { name: 'Back-row Barrage', description: 'Units deployed in the back two rows gain 1 damage.' },
  siphon: { name: 'Clockwork Siphon', description: 'Attacking units recover 1 health per successful attack.' },
  encore: { name: 'Music-box Encore', description: 'Every fourth attack deals 2 extra damage.' },
} as const;
export type PassiveId = keyof typeof PASSIVES;
