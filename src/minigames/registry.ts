import { PALETTE } from '../game/palette';
import type { MinigameDefinition, TouchLayout } from './types';

/** Placeholder for planned games: must be replaced with a real layout before a game ships. */
const TOUCH_TBD: TouchLayout = { movement: 'none', look: 'none', buttons: [], orientation: 'any', notes: 'To be designed with the minigame.' };

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
    touch: {
      movement: 'none',
      look: 'none',
      buttons: [
        { id: 'drum', label: 'Drum', colour: PALETTE.coral },
        { id: 'bell', label: 'Bell', colour: PALETTE.honey },
        { id: 'xylophone', label: 'Xylophone', colour: PALETTE.toyBlue },
        { id: 'musicbox', label: 'Music box', colour: PALETTE.sage },
      ],
      orientation: 'any',
      notes: 'The four instruments are the buttons: a 2×2 grid in portrait, a row in landscape. Tapping the 3D instrument also counts.',
    },
    status: 'integrating',
  },
  { id: 'inferno-escape', title: 'Inferno Escape', tagline: 'Dig, wall up, survive the heat.', accent: PALETTE.coral, players: { min: 2, max: 6 }, controls: [], touch: TOUCH_TBD, status: 'planned' },
  { id: 'wind-up-dash', title: 'Wind-Up Dash', tagline: 'Race through traps and obstacles.', accent: PALETTE.toyBlue, players: { min: 1, max: 6 }, controls: [], touch: TOUCH_TBD, status: 'planned' },
  { id: 'midnight-hunger', title: 'Midnight Hunger', tagline: 'Scavenge by day, hide by night.', accent: PALETTE.inkPurple, players: { min: 2, max: 6 }, controls: [], touch: TOUCH_TBD, status: 'planned' },
  { id: 'find-the-original', title: 'Find the Original', tagline: 'Spot the one true toy among decoys.', accent: PALETTE.sage, players: { min: 1, max: 6 }, controls: [], touch: TOUCH_TBD, status: 'planned' },
  { id: 'red-light-green-light', title: 'Red Light, Green Light', tagline: 'Freeze when the lamp says stop.', accent: PALETTE.coral, players: { min: 2, max: 8 }, controls: [], touch: TOUCH_TBD, status: 'planned' },
  { id: 'blink-duel', title: 'Blink Duel', tagline: 'Teleport, strike, repeat.', accent: PALETTE.inkPurple, players: { min: 2, max: 4 }, controls: [], touch: TOUCH_TBD, status: 'planned' },
  { id: 'music-box-rhythm', title: 'Music Box Rhythm', tagline: 'Four lanes. ASJK. Stay on the beat.', accent: PALETTE.honey, players: { min: 1, max: 4 }, controls: [], touch: TOUCH_TBD, status: 'planned' },
  { id: 'toy-squad', title: 'Toy Squad', tagline: 'A pocket-sized auto-battler.', accent: PALETTE.sage, players: { min: 2, max: 4 }, controls: [], touch: TOUCH_TBD, status: 'planned' },
  { id: 'spellbox-showdown', title: 'Spellbox Showdown', tagline: 'Knock rivals off the arena with spells.', accent: PALETTE.toyBlue, players: { min: 2, max: 4 }, controls: [], touch: TOUCH_TBD, status: 'planned' },
  { id: 'toybox-trivia', title: 'Toybox Trivia', tagline: 'The quiz show for tiny contenders.', accent: PALETTE.honey, players: { min: 1, max: 8 }, controls: [], touch: TOUCH_TBD, status: 'planned' },
];
