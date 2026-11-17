/** Bot opponents: seeded names and looks so a field of toys feels like characters, not filler. */
import { PAINT_JOBS } from '../game/palette';
import { HATS, KEY_SKINS } from '../game/cosmetics';
import { seededRng, shuffle, randInt } from './rng';
import type { BotDifficulty, Contestant } from './types';

const BOT_NAMES = ['Sprocket', 'Pip', 'Clank', 'Bobbin', 'Tock', 'Marbles', 'Thimble', 'Widget', 'Cog', 'Dottie', 'Brass', 'Jinx', 'Nib', 'Rattle'];

export function makeBots(seed: number, count: number, difficulty: BotDifficulty, avoidName?: string): Contestant[] {
  const rng = seededRng(seed);
  const names = shuffle(rng, BOT_NAMES.filter((n) => n.toLowerCase() !== avoidName?.toLowerCase()));
  return Array.from({ length: count }, (_, i) => ({
    id: `bot-${i + 1}`,
    name: names[i % names.length],
    paint: PAINT_JOBS[randInt(rng, PAINT_JOBS.length)],
    hat: HATS[randInt(rng, HATS.length)].id,
    keySkin: KEY_SKINS[randInt(rng, KEY_SKINS.length)].id,
    isLocal: false,
    bot: difficulty,
  }));
}
