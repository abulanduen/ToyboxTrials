/** The four lanes: the same instruments, keys and colours as Copycat Conductor (A S J K). */
import { PALETTE } from '../../game/palette';
import type { Action } from '../../game/input';

export const LANES: { key: string; name: string; color: string; action: Action }[] = [
  { key: 'A', name: 'Drum', color: PALETTE.coral, action: 'slot1' },
  { key: 'S', name: 'Bell', color: PALETTE.honey, action: 'slot2' },
  { key: 'J', name: 'Xylophone', color: PALETTE.toyBlue, action: 'slot3' },
  { key: 'K', name: 'Music box', color: PALETTE.sage, action: 'slot4' },
];
