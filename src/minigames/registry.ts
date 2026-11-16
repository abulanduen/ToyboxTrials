import { PALETTE } from '../game/palette';
import type { MinigameDefinition } from './types';

/**
 * Catalogue of trials. Only Copycat Conductor has an entrance in the hub today, and its
 * existing implementation (from the Base44 app) is not in this repository yet — see
 * docs/01-architecture-audit.md for the integration checklist.
 */
export const MINIGAMES: MinigameDefinition[] = [
  {
    id: 'copycat-conductor',
    title: 'Copycat Conductor',
    tagline: 'Repeat the mechanical orchestra — one note longer every round.',
    accent: PALETTE.honey,
    players: { min: 1, max: 4 },
    controls: [
      { keys: 'A', action: 'Coral drum' },
      { keys: 'S', action: 'Golden bell' },
      { keys: 'J', action: 'Blue xylophone' },
      { keys: 'K', action: 'Green music box' },
    ],
    status: 'integrating',
  },
  { id: 'inferno-escape', title: 'Inferno Escape', tagline: 'Dig, wall up, survive the heat.', accent: PALETTE.coral, players: { min: 2, max: 6 }, controls: [], status: 'planned' },
  { id: 'wind-up-dash', title: 'Wind-Up Dash', tagline: 'Race through traps and obstacles.', accent: PALETTE.toyBlue, players: { min: 1, max: 6 }, controls: [], status: 'planned' },
  { id: 'midnight-hunger', title: 'Midnight Hunger', tagline: 'Scavenge by day, hide by night.', accent: PALETTE.inkPurple, players: { min: 2, max: 6 }, controls: [], status: 'planned' },
  { id: 'find-the-original', title: 'Find the Original', tagline: 'Spot the one true toy among decoys.', accent: PALETTE.sage, players: { min: 1, max: 6 }, controls: [], status: 'planned' },
  { id: 'red-light-green-light', title: 'Red Light, Green Light', tagline: 'Freeze when the lamp says stop.', accent: PALETTE.coral, players: { min: 2, max: 8 }, controls: [], status: 'planned' },
  { id: 'blink-duel', title: 'Blink Duel', tagline: 'Teleport, strike, repeat.', accent: PALETTE.inkPurple, players: { min: 2, max: 4 }, controls: [], status: 'planned' },
  { id: 'music-box-rhythm', title: 'Music Box Rhythm', tagline: 'Four lanes. ASJK. Stay on the beat.', accent: PALETTE.honey, players: { min: 1, max: 4 }, controls: [], status: 'planned' },
  { id: 'toy-squad', title: 'Toy Squad', tagline: 'A pocket-sized auto-battler.', accent: PALETTE.sage, players: { min: 2, max: 4 }, controls: [], status: 'planned' },
  { id: 'spellbox-showdown', title: 'Spellbox Showdown', tagline: 'Knock rivals off the arena with spells.', accent: PALETTE.toyBlue, players: { min: 2, max: 4 }, controls: [], status: 'planned' },
  { id: 'toybox-trivia', title: 'Toybox Trivia', tagline: 'The quiz show for tiny contenders.', accent: PALETTE.honey, players: { min: 1, max: 8 }, controls: [], status: 'planned' },
];
