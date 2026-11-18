/**
 * Toy Squad effect specs: one basic-attack look and one spell look per roster id. Presentation
 * only and pure data (no three.js); `Fx.tsx` plays them from the battle's attack events.
 *
 * What a spell *does* on screen (line, blast radius, rain on every enemy, motes to allies) is
 * derived from its kit in `kits.ts` by `spellLayout`, so visuals cannot drift from the rules.
 * The spec only chooses the toy-specific shape, colours and cast flourish.
 */
import { UNIT_KITS, type EffectTarget } from './kits';
import { TOY_COLOURS as C } from './models';

export const FX_SHAPES = ['orb', 'shard', 'bolt', 'star', 'disc', 'cube', 'chip', 'drop', 'note', 'plus', 'gear', 'slash', 'feather', 'beam', 'dart', 'flame', 'coil', 'ring'] as const;
export type FxShape = typeof FX_SHAPES[number];
/** How a basic attack travels from the attacker to its target. */
export type AttackPath = 'line' | 'arc' | 'bounce' | 'spiral' | 'zigzag' | 'boomerang' | 'jab' | 'sweep' | 'smash' | 'roll' | 'ell';
export type Impact = 'puff' | 'sparks' | 'splat' | 'stars' | 'confetti' | 'bubbles' | 'clang' | 'notes' | 'gears' | 'feathers' | 'drops' | 'ring' | 'shards' | 'burst';
export type Flourish = 'ring' | 'fountain' | 'spiral' | 'burst' | 'pillar' | 'rain';
export interface AttackFx { label: string; shape: FxShape; path: AttackPath; colours: readonly [string, string]; count: number; size: number; impact: Impact; trail?: 'string'; rainbow?: boolean }
export interface SpellFx { label: string; shape: FxShape; colours: readonly [string, string]; flourish: Flourish; rainbow?: boolean }
export interface EffectSpec { attack: AttackFx; spell: SpellFx }
export const RAINBOW = [C.coral, C.honey, C.lime, C.sky, C.lilac, C.pink] as const;
/** Status feedback is the same for every toy so it reads as a shared language. */
export const STATUS_COLOURS = { heal: C.sage, shield: C.blue, stun: C.honey, poison: C.lime, mark: C.coral, silence: C.purple, buff: C.honey, debuff: C.purple, drain: C.coral } as const;

type Extra = Partial<Pick<AttackFx, 'trail' | 'rainbow'>>;
const atk = (label: string, shape: FxShape, path: AttackPath, c1: string, c2: string, count: number, size: number, impact: Impact, extra: Extra = {}): AttackFx =>
  ({ label, shape, path, colours: [c1, c2], count, size, impact, ...extra });
const spell = (label: string, shape: FxShape, c1: string, c2: string, flourish: Flourish, rainbow?: boolean): SpellFx =>
  ({ label, shape, colours: [c1, c2], flourish, ...(rainbow ? { rainbow } : {}) });
const fx = (attack: AttackFx, s: SpellFx): EffectSpec => ({ attack, spell: s });

export const EFFECT_SPECS: Record<string, EffectSpec> = {
  soldier: fx(atk('Bayonet jab', 'beam', 'jab', C.silver, C.blue, 1, 0.5, 'clang'), spell('Musket-ball volley', 'orb', C.tin, C.honey, 'burst')),
  robot: fx(atk('Piston punch', 'cube', 'jab', C.blue, C.tin, 1, 0.55, 'gears'), spell('Overclock cogs', 'gear', C.blue, C.brass, 'ring')),
  hare: fx(atk('Bouncing spring', 'coil', 'bounce', C.tin, C.lilac, 1, 0.5, 'puff'), spell('Springburst coils', 'coil', C.lilac, C.tin, 'burst')),
  'button-brawler': fx(atk('One-two buttons', 'disc', 'jab', C.coral, C.honey, 2, 0.45, 'stars'), spell('Button barrage', 'disc', C.coral, C.cream, 'rain')),
  'peg-pikeman': fx(atk('Pike thrust', 'beam', 'jab', C.woodL, C.silver, 1, 0.42, 'shards'), spell('Peg skewer', 'beam', C.woodL, C.woodD, 'pillar')),
  'marble-slinger': fx(atk('Bouncing marble', 'orb', 'bounce', C.glass, C.coral, 1, 0.42, 'sparks'), spell('Ricochet marbles', 'orb', C.glass, C.honey, 'rain', true)),
  'felt-fox': fx(atk('Felt-claw swipe', 'slash', 'sweep', C.orange, C.cream, 1, 0.8, 'puff'), spell('Foxfire wisps', 'flame', C.orange, C.cream, 'spiral')),
  'thimble-guard': fx(atk('Thimble bash', 'disc', 'jab', C.silver, C.grey, 1, 0.55, 'clang'), spell('Thimble shelter', 'disc', C.silver, C.blue, 'ring')),
  'spool-spinner': fx(atk('Rolling spool', 'disc', 'roll', C.coral, C.woodL, 1, 0.5, 'puff'), spell('Unravelling thread', 'slash', C.coral, C.wine, 'spiral')),
  'paper-medic': fx(atk('Paper plane', 'dart', 'arc', C.white, C.coral, 1, 0.5, 'confetti'), spell('Folded first-aid crosses', 'plus', C.white, C.coral, 'fountain')),
  'crayon-cannon': fx(atk('Crayon shell', 'bolt', 'arc', C.coral, C.honey, 1, 0.6, 'splat'), spell('Waxwork blast', 'bolt', C.coral, C.blue, 'burst', true)),
  'rubber-frog': fx(atk('Sticky glob', 'drop', 'arc', C.lime, C.leaf, 1, 0.45, 'bubbles'), spell('Puddle-pop bubbles', 'orb', C.lime, C.sky, 'fountain')),
  'domino-drummer': fx(atk('Drumstick thump', 'cube', 'smash', C.ink, C.white, 1, 0.45, 'ring'), spell('Toppling dominoes', 'cube', C.ink, C.white, 'ring')),
  'clockwork-mouse': fx(atk('Wire nibble', 'shard', 'jab', C.tin, C.honey, 2, 0.32, 'sparks'), spell('Stolen sparks', 'gear', C.honey, C.tin, 'spiral')),
  'cork-knight': fx(atk('Toothpick slash', 'slash', 'sweep', C.woodL, C.cork, 1, 0.7, 'shards'), spell('Popping corks', 'orb', C.cork, C.honey, 'fountain')),
  'ribbon-rookie': fx(atk('Ribbon streamer', 'beam', 'zigzag', C.coral, C.pink, 3, 0.3, 'confetti'), spell('Rally ribbons', 'star', C.pink, C.coral, 'spiral')),
  'cap-captain': fx(atk('Sabre cut', 'slash', 'sweep', C.silver, C.navy, 1, 0.85, 'clang'), spell('Bottle-cap salute', 'disc', C.silver, C.coral, 'ring')),
  'yo-yo-yak': fx(atk('Yo-yo throw', 'disc', 'boomerang', C.blue, C.honey, 1, 0.55, 'stars', { trail: 'string' }), spell('Round-trip slam', 'disc', C.blue, C.honey, 'burst')),
  'kite-archer': fx(atk('Kite-string arrow', 'bolt', 'line', C.woodL, C.coral, 1, 0.42, 'feathers', { trail: 'string' }), spell('Crosswind kites', 'dart', C.coral, C.honey, 'rain')),
  'bead-bomber': fx(atk('Lobbed beads', 'orb', 'arc', C.pink, C.sage, 3, 0.3, 'burst', { rainbow: true }), spell('Scatterbead salvo', 'orb', C.pink, C.lilac, 'burst', true)),
  'stitch-serpent': fx(atk('Stitching fang', 'shard', 'zigzag', C.felt, C.cream, 1, 0.42, 'bubbles'), spell('Binding seam', 'beam', C.cream, C.felt, 'spiral')),
  'pencil-lancer': fx(atk('Pencil lance', 'beam', 'jab', C.honey, C.ink, 1, 0.55, 'sparks'), spell('Ruled line', 'beam', C.honey, C.pink, 'pillar')),
  'spring-ram': fx(atk('Sprung headbutt', 'coil', 'jab', C.tin, C.cream, 1, 0.6, 'stars'), spell('Battering spring', 'coil', C.tin, C.honey, 'burst')),
  'patchwork-nurse': fx(atk('Thrown patch', 'chip', 'arc', C.coral, C.blue, 1, 0.55, 'confetti', { rainbow: true }), spell('Patchwork picnic', 'chip', C.pink, C.blue, 'ring', true)),
  'cog-crab': fx(atk('Claw pinch', 'gear', 'jab', C.brass, C.copper, 2, 0.4, 'clang'), spell('Clamping cogs', 'gear', C.brass, C.coral, 'ring')),
  'paper-panther': fx(atk('Paper-cut claws', 'slash', 'sweep', C.plum, C.cream, 2, 0.7, 'confetti'), spell('Midnight cut', 'slash', C.plum, C.honey, 'burst')),
  'windmill-imp': fx(atk('Spinning blade', 'star', 'spiral', C.cream, C.blue, 1, 0.5, 'puff'), spell('Gust of gears', 'slash', C.sky, C.cream, 'spiral')),
  'copper-bat': fx(atk('Echo rings', 'ring', 'line', C.copper, C.honey, 2, 0.4, 'sparks'), spell('Echo drain', 'ring', C.copper, C.plum, 'burst')),
  'domino-duellist': fx(atk('Foil lunge', 'beam', 'jab', C.silver, C.ink, 2, 0.34, 'clang'), spell('Double-six tiles', 'cube', C.white, C.ink, 'pillar')),
  'magnet-mole': fx(atk('Magnetic zap', 'bolt', 'zigzag', C.coral, C.silver, 1, 0.4, 'sparks'), spell('Polarised burst', 'shard', C.coral, C.silver, 'ring')),
  'clockwork-bear': fx(atk('Paw smash', 'orb', 'smash', C.woodM, C.cream, 1, 0.75, 'stars'), spell('Bear-hug barrier', 'gear', C.brass, C.woodM, 'ring')),
  'music-box-mage': fx(atk('Chiming notes', 'note', 'spiral', C.violet, C.honey, 2, 0.5, 'notes'), spell('Arpeggio storm', 'note', C.lilac, C.honey, 'rain')),
  'jackhammer-jack': fx(atk('Jackhammer pound', 'bolt', 'smash', C.steel, C.honey, 3, 0.4, 'ring'), spell('Jackhammer quake', 'cube', C.card, C.steel, 'burst')),
  'ribbon-ronin': fx(atk('Ribbon crescent', 'slash', 'sweep', C.coral, C.honey, 1, 1.05, 'confetti'), spell('Crescent ribbons', 'slash', C.coral, C.honey, 'ring')),
  'paint-pot-pyro': fx(atk('Paint flare', 'flame', 'arc', C.coral, C.orange, 2, 0.5, 'splat'), spell('Paint-pot inferno', 'flame', C.orange, C.honey, 'fountain')),
  'porcelain-panda': fx(atk('Flying saucer', 'disc', 'arc', C.white, C.blue, 1, 0.5, 'shards'), spell('Soothing tea', 'drop', C.blue, C.white, 'fountain')),
  'tin-toxin': fx(atk('Toxic spit', 'drop', 'arc', C.lime, C.steel, 2, 0.4, 'bubbles'), spell('Toxic toybox fumes', 'orb', C.lime, C.plum, 'fountain')),
  'quill-quarreller': fx(atk('Quill bolt', 'feather', 'line', C.white, C.ink, 1, 0.75, 'drops'), spell('Thousand quills', 'feather', C.cream, C.navy, 'pillar')),
  'velvet-vampire': fx(atk('Velvet fang', 'shard', 'spiral', C.wine, C.plum, 1, 0.45, 'drops'), spell('Velvet feast', 'drop', C.wine, C.coral, 'spiral')),
  'ratchet-rhino': fx(atk('Horn charge', 'bolt', 'jab', C.brass, C.tin, 1, 0.8, 'gears'), spell('Riveting stampede', 'gear', C.tin, C.brass, 'pillar')),
  'glass-griffin': fx(atk('Glass talons', 'shard', 'arc', C.glass, C.sky, 2, 0.45, 'shards'), spell('Prismatic dive', 'shard', C.glass, C.lilac, 'rain')),
  'chess-chevalier': fx(atk("Knight's move", 'cube', 'ell', C.woodL, C.ink, 1, 0.5, 'clang'), spell('Checkmate squares', 'chip', C.ink, C.cream, 'ring')),
  'lantern-lynx': fx(atk('Lantern spark', 'flame', 'line', C.honey, C.cream, 1, 0.45, 'stars'), spell('Lantern lock', 'star', C.honey, C.ink, 'ring')),
  'brass-behemoth': fx(atk('Boiler fist', 'cube', 'smash', C.brass, C.steel, 1, 0.85, 'gears'), spell('Brass bastion', 'disc', C.brass, C.copper, 'ring')),
  'carousel-chimera': fx(atk('Three-headed snap', 'slash', 'sweep', C.honey, C.coral, 3, 0.75, 'stars'), spell('Carousel cataclysm', 'star', C.coral, C.cream, 'spiral')),
  'prism-princess': fx(atk('Refracted beams', 'shard', 'line', C.glass, C.pink, 3, 0.36, 'sparks', { rainbow: true }), spell('Royal refraction', 'shard', C.glass, C.pink, 'rain', true)),
  'rivet-raccoon': fx(atk('Rivet rocket', 'bolt', 'arc', C.steel, C.honey, 1, 0.6, 'burst'), spell('Rivet rocketfall', 'bolt', C.steel, C.coral, 'rain')),
  'suture-sphinx': fx(atk('Riddle glyph', 'shard', 'spiral', C.honey, C.blue, 1, 0.5, 'stars'), spell("Sphinx's shelter", 'plus', C.honey, C.blue, 'ring')),
  'obsidian-origami': fx(atk('Paper shuriken', 'dart', 'line', C.obsidian, C.honey, 2, 0.5, 'confetti'), spell('Obsidian eclipse', 'dart', C.plum, C.honey, 'pillar')),
  'venom-violinist': fx(atk('Sour notes', 'note', 'zigzag', C.lime, C.plum, 2, 0.48, 'bubbles'), spell('Viper concerto', 'note', C.lime, C.feltD, 'spiral')),
  'pendulum-paladin': fx(atk('Pendulum swing', 'disc', 'sweep', C.brass, C.cream, 1, 0.6, 'stars'), spell('Stolen second', 'gear', C.honey, C.cream, 'ring')),
  'silver-spider': fx(atk('Web strand', 'orb', 'line', C.silver, C.white, 1, 0.3, 'ring', { trail: 'string' }), spell('Web of weakness', 'beam', C.silver, C.coral, 'burst')),
  'turbine-tiger': fx(atk('Afterburner claws', 'slash', 'sweep', C.orange, C.honey, 2, 0.8, 'sparks'), spell('Overdrive roar', 'flame', C.orange, C.sky, 'burst')),
  'needle-navigator': fx(atk('Threaded needle', 'bolt', 'line', C.silver, C.coral, 1, 0.48, 'sparks', { trail: 'string' }), spell('Needle north', 'beam', C.silver, C.coral, 'pillar')),
  'royal-rocking-horse': fx(atk('Royal hoof stomp', 'orb', 'smash', C.woodL, C.coral, 2, 0.5, 'ring'), spell('Rocking coronation', 'star', C.honey, C.coral, 'fountain')),
  'grandfather-gear': fx(atk('Rolling great gear', 'gear', 'roll', C.brass, C.copper, 1, 0.85, 'gears'), spell('Stop the clock', 'gear', C.brass, C.cream, 'ring')),
  'aurora-automaton': fx(atk('Aurora rings', 'ring', 'line', C.lime, C.sky, 3, 0.36, 'sparks', { rainbow: true }), spell('Spectrum cascade', 'beam', C.sky, C.lilac, 'rain', true)),
  'phoenix-pinwheel': fx(atk('Pinwheel embers', 'flame', 'spiral', C.coral, C.honey, 2, 0.5, 'burst'), spell('Rekindling feathers', 'feather', C.coral, C.honey, 'fountain')),
  'velvet-dragon': fx(atk('Patchwork breath', 'flame', 'line', C.violet, C.coral, 3, 0.55, 'puff'), spell("Dragon's patchwork breath", 'flame', C.violet, C.lime, 'pillar')),
  'celestial-seamstress': fx(atk('Threaded star', 'star', 'arc', C.honey, C.sky, 1, 0.5, 'stars', { trail: 'string' }), spell('Stitched constellation', 'star', C.honey, C.sky, 'rain')),
  'crownless-king': fx(atk('Greatsword cleave', 'slash', 'smash', C.silver, C.plum, 1, 1.2, 'ring'), spell('Final decree', 'shard', C.honey, C.plum, 'pillar')),
  'infinity-jack': fx(atk('Boxing spring', 'coil', 'boomerang', C.coral, C.blue, 1, 0.6, 'confetti'), spell('Out of the box', 'coil', C.honey, C.violet, 'burst', true)),
};

const ENEMY: readonly EffectTarget[] = ['target', 'nearEnemies', 'allEnemies', 'line', 'markedEnemies'];
export interface SpellLayout {
  /** A line through the target to the board edge. */ line: boolean;
  /** Blast radius in squares around the target (0 = none). */ blast: number;
  /** Lands on every living enemy. */ everyEnemy: boolean;
  /** One heavy shot at the target only. */ single: boolean;
  /** Follow-up strike on marked enemies. */ marked: boolean;
  /** Reaches allies (heal, shield, buff, mana or cleanse). */ allies: boolean;
  /** Aura radius in squares around the caster (0 = none). */ aura: number;
}
/** The on-board footprint of a unit's spell, read straight from its kit. */
export function spellLayout(kind: string): SpellLayout {
  const effects = UNIT_KITS[kind].spell.effects, has = (t: EffectTarget) => effects.some(f => f.target === t);
  const radius = (t: EffectTarget) => Math.max(0, ...effects.filter(f => f.target === t).map(f => f.radius ?? 1));
  const line = has('line'), blast = radius('nearEnemies'), everyEnemy = has('allEnemies');
  return { line, blast, everyEnemy, single: has('target') && !line && !blast && !everyEnemy, marked: has('markedEnemies'),
    allies: effects.some(f => !ENEMY.includes(f.target)), aura: radius('nearAllies') };
}
