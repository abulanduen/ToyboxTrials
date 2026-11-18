/** Individually authored unit kits. Shared effect primitives keep the rules testable. */
export type Trait = 'Tin' | 'Clockwork' | 'Felt' | 'Paper' | 'Wood' | 'Prism' | 'Vanguard' | 'Ranger' | 'Medic' | 'Trickster' | 'Artificer';
export type EffectTarget = 'self' | 'target' | 'lowestAlly' | 'nearAllies' | 'allAllies' | 'nearEnemies' | 'allEnemies' | 'line' | 'markedEnemies' | 'traitAllies';
export type BuffStat = 'damage' | 'armour' | 'range' | 'haste' | 'spellPower';
export interface KitEffect {
  type: 'damage' | 'heal' | 'shield' | 'mana' | 'buff' | 'poison' | 'stun' | 'mark' | 'cleanse' | 'silence';
  target: EffectTarget; amount: number; radius?: number; duration?: number; stat?: BuffStat; trait?: Trait; pierce?: boolean;
}
export interface UnitPassive { name: string; trigger: 'start' | 'attack' | 'hurt' | 'cast' | 'wounded'; every: number; effects: KitEffect[]; description: string }
export interface UnitSpell { name: string; mana: number; cooldown: number; effects: KitEffect[]; description: string }
export interface UnitKit { traits: Trait[]; passive: UnitPassive; spell: UnitSpell }
const e = (type: KitEffect['type'], target: EffectTarget, amount: number, options: Partial<KitEffect> = {}): KitEffect => ({ type, target, amount, ...options });
const d = (n: number, target: EffectTarget = 'target', radius = 1) => e('damage', target, n, { radius });
const buff = (stat: BuffStat, n: number, target: EffectTarget = 'nearAllies', duration = 6, radius = 2) => e('buff', target, n, { stat, duration, radius });
export function describeEffects(effects: readonly KitEffect[]): string {
  const targets: Record<EffectTarget, string> = { self: 'self', target: 'the enemy target', lowestAlly: 'the most wounded ally', nearAllies: 'allies near the caster', allAllies: 'all living allies', nearEnemies: 'enemies around the target', allEnemies: 'all living enemies', line: 'enemies on the target line', markedEnemies: 'marked enemies', traitAllies: 'matching-trait allies' };
  return effects.map(f => {
    const value = f.type === 'cleanse' ? 'remove poison, stun, silence, marks and negative buffs from' : `${f.type}${f.stat ? ` ${f.stat}` : ''} ${f.amount}${f.pierce ? ' (ignores armour)' : ''} to`;
    return `${value} ${targets[f.target]}${f.trait ? ` (${f.trait})` : ''}${f.radius && ['nearAllies','nearEnemies'].includes(f.target) ? `, radius ${f.radius}` : ''}${f.duration ? f.duration === 999 ? ', for this battle' : `, ${f.duration} ticks` : ''}`;
  }).join('; ') + '.';
}
function kit(traits: Trait[], passive: string, trigger: UnitPassive['trigger'], every: number, pe: KitEffect[], spell: string, se: KitEffect[], mana = 60, cooldown = 6): UnitKit {
  const when = { start: 'At battle start', attack: `Every ${every} basic attack(s)`, hurt: `Every ${every} tick(s) in which this toy takes damage`, cast: 'After casting its spell', wounded: 'Once per battle, when living below 40% health' };
  return { traits, passive: { name: passive, trigger, every, effects: pe, description: `${when[trigger]}: ${describeEffects(pe)}` },
    spell: { name: spell, mana, cooldown, effects: se, description: describeEffects(se) } };
}
export const UNIT_KITS: Record<string, UnitKit> = {
  soldier: kit(['Tin','Vanguard'], 'Parade Discipline','start',1,[e('shield','nearAllies',2,{radius:1})], 'Tin Volley',[d(6,'line'),e('mark','target',1,{duration:6})]),
  robot: kit(['Clockwork','Vanguard'], 'Self-winding Core','hurt',1,[e('mana','self',8)], 'Overclock Barrier',[e('shield','nearAllies',8,{radius:2}),buff('haste',1)],70),
  hare: kit(['Felt','Ranger'], 'Bounding Rhythm','attack',3,[e('mana','self',12)], 'Springburst',[d(5,'nearEnemies'),e('stun','target',1,{duration:1})]),
  'button-brawler': kit(['Tin','Trickster'], 'Buttoned-up','attack',3,[e('shield','self',3)], 'Button Barrage',[d(8),e('mark','target',2,{duration:5})]),
  'peg-pikeman': kit(['Wood','Vanguard'], 'Picket Formation','start',1,[buff('armour',1,'nearAllies',999,1)], 'Peg Skewer',[e('damage','line',7,{pierce:true})]),
  'marble-slinger': kit(['Prism','Ranger'], 'Polished Aim','attack',2,[e('mark','target',1,{duration:4})], 'Ricochet Rain',[d(5,'nearEnemies',2),e('mana','nearAllies',5,{radius:1})],70),
  'felt-fox': kit(['Felt','Trickster'], 'Soft Landing','wounded',1,[e('shield','self',7)], 'Foxfire Feint',[d(7),buff('armour',-2,'target',5)]),
  'thimble-guard': kit(['Tin','Vanguard'], 'Protective Rim','hurt',2,[e('shield','lowestAlly',3)], 'Thimble Shelter',[e('shield','allAllies',5),e('cleanse','self',0)],80),
  'spool-spinner': kit(['Clockwork','Artificer'], 'Threaded Conduit','cast',1,[e('mana','nearAllies',8,{radius:2})], 'Unravelling Spiral',[d(6,'nearEnemies'),buff('haste',-1,'nearEnemies',4,1)]),
  'paper-medic': kit(['Paper','Medic'], 'Triage Notes','attack',3,[e('heal','lowestAlly',3)], 'Folded First Aid',[e('heal','lowestAlly',10),e('cleanse','lowestAlly',0)],70),
  'crayon-cannon': kit(['Wood','Artificer'], 'Colour Primer','attack',2,[e('mark','target',1,{duration:5})], 'Waxwork Blast',[d(8,'nearEnemies'),e('poison','nearEnemies',1,{radius:1,duration:4})],70),
  'rubber-frog': kit(['Felt','Trickster'], 'Sticky Skin','hurt',2,[e('poison','target',1,{duration:3})], 'Puddle Pop',[d(4,'nearEnemies',2),e('poison','nearEnemies',2,{radius:2,duration:5})],70),
  'domino-drummer': kit(['Wood','Artificer'], 'Steady Beat','attack',3,[buff('damage',1,'nearAllies',4,1)], 'Domino Drop',[d(5,'line'),e('stun','line',1,{duration:2})],80),
  'clockwork-mouse': kit(['Clockwork','Trickster'], 'Scavenged Sparks','attack',2,[e('heal','self',2)], 'Nibble the Wires',[d(7),e('silence','target',1,{duration:4})]),
  'cork-knight': kit(['Wood','Vanguard'], 'Cork Armour','wounded',1,[e('shield','nearAllies',4,{radius:1})], 'Bottle-stop Bulwark',[buff('armour',2,'nearAllies',8,1),e('heal','self',6)],70),
  'ribbon-rookie': kit(['Paper','Ranger'], 'Encouraging Bow','start',1,[e('mana','lowestAlly',15)], 'Ribbon Rally',[buff('damage',2,'nearAllies',6,2),buff('haste',1,'self',6)]),
  'cap-captain': kit(['Tin','Vanguard'], 'Captain’s Muster','start',1,[e('shield','traitAllies',5,{trait:'Tin'})], 'Capstone Command',[e('shield','nearAllies',10,{radius:2}),buff('damage',2,'nearAllies',6,2)],80),
  'yo-yo-yak': kit(['Felt','Vanguard'], 'Weighted Return','hurt',3,[e('heal','self',5)], 'Round-trip Slam',[d(10,'nearEnemies'),e('mark','nearEnemies',2,{radius:1,duration:6})],70),
  'kite-archer': kit(['Paper','Ranger'], 'Tailwind','start',1,[buff('range',1,'traitAllies',999,0)], 'Crosswind Arrows',[d(8,'line'),buff('haste',1,'nearAllies',6,2)],70),
  'bead-bomber': kit(['Prism','Artificer'], 'Fuse Sharing','cast',1,[e('shield','nearAllies',4,{radius:1})], 'Scatterbead Salvo',[d(11,'nearEnemies',2)],80),
  'stitch-serpent': kit(['Felt','Trickster'], 'Venom Stitch','attack',2,[e('poison','target',2,{duration:4})], 'Binding Seam',[d(8),e('stun','target',1,{duration:2}),e('poison','nearEnemies',2,{radius:1,duration:6})],70),
  'pencil-lancer': kit(['Wood','Ranger'], 'Graphite Edge','attack',3,[buff('armour',-1,'target',6)], 'Straight-line Solution',[e('damage','line',12,{pierce:true}),e('mark','line',2,{duration:6})],80),
  'spring-ram': kit(['Clockwork','Vanguard'], 'Coiled Guard','wounded',1,[buff('armour',3,'self',8)], 'Battering Spring',[d(10),e('stun','nearEnemies',1,{radius:1,duration:2})],70),
  'patchwork-nurse': kit(['Felt','Medic'], 'Shared Patches','hurt',2,[e('heal','lowestAlly',4)], 'Patchwork Picnic',[e('heal','nearAllies',9,{radius:2}),e('cleanse','nearAllies',0,{radius:2})],80),
  'cog-crab': kit(['Clockwork','Vanguard'], 'Interlocking Plates','start',1,[buff('armour',1,'traitAllies',999,0)], 'Clamping Cogs',[d(9,'nearEnemies'),buff('haste',-1,'nearEnemies',6,1)],70),
  'paper-panther': kit(['Paper','Trickster'], 'Paper Trail','attack',2,[e('mark','target',2,{duration:5})], 'Midnight Cut',[d(12),e('damage','markedEnemies',4)],70),
  'windmill-imp': kit(['Clockwork','Artificer'], 'Borrowed Wind','attack',3,[e('mana','nearAllies',10,{radius:1})], 'Gust of Gears',[d(8,'nearEnemies',2),buff('haste',1,'nearAllies',6,1)],70),
  'copper-bat': kit(['Tin','Trickster'], 'Copper Siphon','cast',1,[e('heal','self',7)], 'Echo Drain',[d(9,'nearEnemies'),e('heal','nearAllies',4,{radius:1})],70),
  'domino-duellist': kit(['Wood','Vanguard'], 'Counterbalance','hurt',2,[buff('damage',2,'self',4)], 'Double-six Duel',[d(13),e('silence','target',1,{duration:4})],80),
  'magnet-mole': kit(['Tin','Artificer'], 'Magnetic Alignment','start',1,[e('mana','traitAllies',12,{trait:'Artificer'})], 'Polarised Burst',[d(9,'nearEnemies',2),e('mark','nearEnemies',2,{radius:2,duration:5})],80),
  'clockwork-bear': kit(['Clockwork','Vanguard'], 'Hibernate','wounded',1,[e('heal','self',12),e('shield','self',6)], 'Bear-hug Barrier',[e('shield','nearAllies',14,{radius:2}),e('stun','target',1,{duration:2})],80),
  'music-box-mage': kit(['Prism','Artificer'], 'Resonant Tines','cast',1,[buff('spellPower',1,'nearAllies',8,2)], 'Arpeggio Storm',[d(13,'nearEnemies',2),e('mana','allAllies',8)],90),
  'jackhammer-jack': kit(['Tin','Vanguard'], 'Percussive Plates','hurt',2,[e('damage','target',3)], 'Jackhammer Quake',[d(14,'nearEnemies',2),e('stun','nearEnemies',1,{radius:2,duration:2})],90),
  'ribbon-ronin': kit(['Paper','Trickster'], 'Loose Ends','attack',3,[e('damage','markedEnemies',3)], 'Ribbon Crescent',[d(15,'nearEnemies'),e('mark','nearEnemies',2,{radius:1,duration:8})],80),
  'paint-pot-pyro': kit(['Wood','Artificer'], 'Wet Paint','attack',2,[buff('armour',-1,'target',5)], 'Paint-pot Inferno',[d(13,'nearEnemies',2),e('poison','nearEnemies',3,{radius:2,duration:6})],90),
  'porcelain-panda': kit(['Prism','Medic'], 'Gentle Glaze','start',1,[e('shield','traitAllies',7,{trait:'Medic'})], 'Porcelain Sanctuary',[e('heal','allAllies',10),e('cleanse','allAllies',0)],90),
  'tin-toxin': kit(['Tin','Trickster'], 'Corrosive Coating','attack',2,[e('poison','target',3,{duration:4})], 'Toxic Toybox',[e('poison','allEnemies',3,{duration:6}),e('mark','nearEnemies',2,{radius:2,duration:6})],90),
  'quill-quarreller': kit(['Paper','Ranger'], 'Quill Fletching','start',1,[buff('damage',1,'traitAllies',999,0)], 'Thousand-quill Line',[e('damage','line',18,{pierce:true})],80),
  'velvet-vampire': kit(['Felt','Medic'], 'Crimson Lining','attack',3,[e('heal','lowestAlly',5)], 'Velvet Feast',[d(14,'nearEnemies'),e('heal','nearAllies',8,{radius:2})],80),
  'ratchet-rhino': kit(['Clockwork','Vanguard'], 'Ratchet Momentum','attack',3,[buff('damage',2,'self',8)], 'Riveting Stampede',[d(16,'line'),e('stun','line',1,{duration:2})],80),
  'glass-griffin': kit(['Prism','Ranger'], 'Fracture Sight','attack',2,[e('mark','target',3,{duration:6})], 'Prismatic Dive',[d(17),e('damage','markedEnemies',6)],80),
  'chess-chevalier': kit(['Wood','Vanguard'], 'Knight’s Escort','start',1,[e('shield','nearAllies',7,{radius:1})], 'Checkmate Formation',[buff('damage',3,'nearAllies',8,2),buff('armour',2,'nearAllies',8,2)],80),
  'lantern-lynx': kit(['Prism','Trickster'], 'Guiding Glow','cast',1,[e('cleanse','lowestAlly',0),e('mana','lowestAlly',15)], 'Lantern Lock',[d(12,'nearEnemies',2),e('silence','nearEnemies',1,{radius:2,duration:4})],90),
  'brass-behemoth': kit(['Tin','Vanguard'], 'Living Foundry','hurt',2,[e('shield','nearAllies',6,{radius:2})], 'Brass Bastion',[e('shield','allAllies',16),buff('armour',3,'allAllies',8)],100),
  'carousel-chimera': kit(['Felt','Trickster'], 'Threefold Rhythm','attack',3,[e('damage','nearEnemies',5,{radius:1})], 'Carousel Cataclysm',[d(20,'nearEnemies',2),buff('haste',-1,'nearEnemies',6,2)],90),
  'prism-princess': kit(['Prism','Artificer'], 'Reflected Brilliance','cast',1,[e('mana','traitAllies',15,{trait:'Prism'})], 'Royal Refraction',[d(17,'allEnemies'),e('mark','allEnemies',2,{duration:6})],100),
  'rivet-raccoon': kit(['Tin','Ranger'], 'Salvaged Ammunition','attack',3,[e('mana','self',20)], 'Rivet Rocketfall',[d(24,'nearEnemies',2),buff('armour',-3,'nearEnemies',8,2)],100),
  'suture-sphinx': kit(['Felt','Medic'], 'Mending Riddle','wounded',1,[e('heal','allAllies',8)], 'Sphinx’s Shelter',[e('heal','nearAllies',18,{radius:3}),e('shield','nearAllies',10,{radius:3})],100),
  'obsidian-origami': kit(['Paper','Trickster'], 'Black Fold','attack',2,[e('silence','target',1,{duration:2})], 'Obsidian Eclipse',[e('damage','line',25,{pierce:true}),e('stun','markedEnemies',1,{duration:2})],90),
  'venom-violinist': kit(['Paper','Artificer'], 'Vibrating Venom','cast',1,[e('poison','allEnemies',2,{duration:4})], 'Viper Concerto',[d(16,'nearEnemies',3),e('poison','nearEnemies',4,{radius:3,duration:8})],100),
  'pendulum-paladin': kit(['Clockwork','Vanguard'], 'Pendulum Promise','hurt',3,[e('cleanse','nearAllies',0,{radius:2})], 'Stolen Second',[e('stun','nearEnemies',1,{radius:2,duration:3}),e('shield','nearAllies',12,{radius:2})],100,8),
  'silver-spider': kit(['Tin','Trickster'], 'Silver Threads','attack',3,[e('shield','lowestAlly',8)], 'Web of Weakness',[d(18,'nearEnemies',2),buff('armour',-3,'nearEnemies',8,2),buff('haste',-1,'nearEnemies',6,2)],90),
  'turbine-tiger': kit(['Clockwork','Ranger'], 'Turbine Wake','cast',1,[buff('haste',1,'traitAllies',8,0)], 'Overdrive Roar',[buff('haste',1,'allAllies',8),buff('damage',3,'allAllies',8)],100),
  'needle-navigator': kit(['Paper','Ranger'], 'Thread the Mark','attack',2,[e('mark','target',3,{duration:7})], 'Needle North',[e('damage','line',24,{pierce:true}),e('mana','nearAllies',12,{radius:2})],90),
  'royal-rocking-horse': kit(['Wood','Vanguard'], 'Royal Retinue','start',1,[e('shield','traitAllies',10,{trait:'Wood'})], 'Rocking Coronation',[d(18,'nearEnemies',2),buff('damage',4,'nearAllies',8,2)],90),
  'grandfather-gear': kit(['Clockwork','Vanguard'], 'Ancient Escapement','start',1,[e('mana','allAllies',20)], 'Stop the Clock',[e('stun','allEnemies',1,{duration:2}),e('shield','allAllies',18)],100,10),
  'aurora-automaton': kit(['Prism','Artificer'], 'Aurora Circuit','cast',1,[buff('spellPower',2,'allAllies',8)], 'Spectrum Cascade',[d(26,'allEnemies'),e('mark','allEnemies',3,{duration:8})],100,8),
  'phoenix-pinwheel': kit(['Paper','Medic'], 'Undying Ember','wounded',1,[e('heal','self',20),e('shield','self',12)], 'Rekindle the Room',[d(24,'nearEnemies',3),e('heal','allAllies',15),e('cleanse','allAllies',0)],100,8),
  'velvet-dragon': kit(['Felt','Vanguard'], 'Velvet Dominion','start',1,[buff('damage',2,'traitAllies',999,0)], 'Dragon’s Patchwork Breath',[d(32,'line'),e('poison','line',5,{duration:8})],100,8),
  'celestial-seamstress': kit(['Prism','Medic'], 'Constellation Stitch','cast',1,[e('shield','allAllies',10)], 'Stitch the Stars',[e('heal','allAllies',24),e('cleanse','allAllies',0),buff('armour',2,'allAllies',8)],100,8),
  'crownless-king': kit(['Wood','Trickster'], 'Unclaimed Throne','attack',3,[e('mark','allEnemies',2,{duration:5})], 'Final Decree',[d(38),e('damage','markedEnemies',14),buff('damage',4,'nearAllies',8,2)],100,8),
  'infinity-jack': kit(['Clockwork','Artificer'], 'Endless Crank','attack',2,[e('mana','nearAllies',12,{radius:2})], 'Out of the Box',[d(30,'nearEnemies',3),e('silence','nearEnemies',1,{radius:3,duration:5}),buff('haste',1,'allAllies',6)],100,8),
};
// Trait-targeted effects default to the caster's origin trait when not explicitly specified.
for (const value of Object.values(UNIT_KITS)) for (const effect of [...value.passive.effects, ...value.spell.effects]) {
  if (effect.target === 'traitAllies' && !effect.trait) effect.trait = value.traits[0];
}
for (const value of Object.values(UNIT_KITS)) {
  value.passive.description = value.passive.description.split(': ')[0] + ': ' + describeEffects(value.passive.effects);
  value.spell.description = describeEffects(value.spell.effects);
}
export const TRAIT_BONUSES: Record<Trait, string> = {
  Tin: '2/4 distinct: +1/+2 armour; at 4 also +4 starting shield.',
  Clockwork: '2/4 distinct: +10/+20 starting mana; at 4 +5 mana per basic attack.',
  Felt: '2/4 distinct: +4/+10 maximum health.', Paper: '2/4 distinct: +1/+3 spell power.',
  Wood: '2/4 distinct: +3/+8 starting shield.', Prism: '2/4 distinct: +1/+2 spell power; at 4 also +10 starting mana.',
  Vanguard: '2/4 distinct: +1/+2 armour.', Ranger: '2/4 distinct: +1/+2 range.',
  Medic: '2/4 distinct: +1/+3 healing power.', Trickster: '2/4 distinct: +1/+3 bonus damage against marked enemies.',
  Artificer: '2/4 distinct: +3/+6 mana per basic attack.',
};
