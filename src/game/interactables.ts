/**
 * Hub interactables: data + handlers. The player controller finds the nearest one in range,
 * shows a prompt, and calls `interact(id)` on E. Scene props listen on the event bus for
 * their visual reaction.
 */
import { events } from './events';
import { sfx } from './audio';
import { useGame } from './store';
import { PALETTE } from './palette';
import { rewardForSecret } from './cosmetics';
import { GATES, JACK, MUSICBOX, PAVILION, SCOREBOARD, SHOP, TOWER, WORKSHOP, frontOf } from '../scene/layout';

export interface Interactable {
  id: string;
  x: number;
  z: number;
  radius: number;
  verb: string;
  label: string;
  /** Required feet height range (e.g. the key on top of the tower). */
  minY?: number;
  /** Hidden objects don't advertise themselves until you're close. */
  secret?: boolean;
  /** Temporarily unavailable (e.g. key collected). */
  disabled?: () => boolean;
}

export const SECRET_IDS = ['musicbox', 'marble', 'jack', 'key'] as const;

let keyCooldownUntil = 0;
export const keyAvailable = () => performance.now() > keyCooldownUntil;

const gate = (id: string) => {
  const g = GATES.find((x) => x.id === id)!;
  return frontOf(g.x, g.z, g.rot, 2.2);
};

export const INTERACTABLES: Interactable[] = [
  { id: 'gate-copycat', ...gate('gate-copycat'), radius: 4.5, verb: 'Enter', label: 'Copycat Conductor' },
  { id: 'gate-inferno', ...gate('gate-inferno'), radius: 4.5, verb: 'Peek at', label: 'Inferno Escape' },
  { id: 'gate-dash', ...gate('gate-dash'), radius: 4.5, verb: 'Peek at', label: 'Wind-Up Dash' },
  { id: 'pavilion', ...frontOf(PAVILION.x, PAVILION.z, 0, PAVILION.d / 2 + 3), radius: 4.5, verb: 'Visit', label: 'Tournament Pavilion' },
  { id: 'workshop', ...frontOf(WORKSHOP.x, WORKSHOP.z, WORKSHOP.rot, WORKSHOP.d / 2 + 2.5), radius: 5, verb: 'Tinker at', label: 'the Workshop' },
  { id: 'shop', ...frontOf(SHOP.x, SHOP.z, SHOP.rot, SHOP.d / 2 + 6), radius: 5, verb: 'Browse', label: 'Odds & Ends Shop' },
  { id: 'scoreboard', ...frontOf(SCOREBOARD.x, SCOREBOARD.z, SCOREBOARD.rot, 3.5), radius: 5, verb: 'Read', label: 'the Scoreboard' },
  // hidden
  { id: 'musicbox', x: MUSICBOX.x, z: MUSICBOX.z + 3, radius: 3.4, verb: 'Crank', label: 'a forgotten music box', secret: true },
  { id: 'marble', x: -9, z: -6, radius: 3.6, verb: 'Push', label: 'the giant marble', secret: true },
  { id: 'jack', x: JACK.x + 3.2, z: JACK.z + 0.5, radius: 3.4, verb: 'Open', label: 'a suspicious box', secret: true },
  { id: 'key', x: TOWER.block.x, z: TOWER.block.z, radius: 2.4, verb: 'Grab', label: 'the golden key', secret: true, minY: TOWER.block.top - 0.5, disabled: () => !keyAvailable() },
];

/** Live position overrides for movable interactables (the marble rolls). */
export const livePositions = new Map<string, { x: number; z: number }>();

export function interactablePos(i: Interactable) {
  return livePositions.get(i.id) ?? i;
}

function discover(id: string, name: string) {
  const g = useGame.getState();
  if (g.markSecret(id)) {
    sfx.reward();
    const n = useGame.getState().secretsFound.length;
    const reward = rewardForSecret(id);
    g.pushTicket({
      title: 'Secret found!',
      body: `${name}: ${n}/${SECRET_IDS.length} playroom secrets${reward ? `. Unlocked: ${reward} (Workshop)` : ''}`,
      tone: 'reward',
    });
  }
}

export function interact(id: string, facing: { x: number; z: number }) {
  const g = useGame.getState();
  events.emit('player:interact');

  switch (id) {
    case 'gate-copycat':
      sfx.interact();
      events.emit('gate:open', { id });
      g.openPanel({
        kind: 'copycat',
        title: 'Copycat Conductor',
        subtitle: 'The mechanical music theatre',
        accent: PALETTE.honey,
      });
      break;
    case 'gate-inferno':
      sfx.click();
      g.openPanel({
        kind: 'preview',
        title: 'Inferno Escape',
        subtitle: 'Arena under construction',
        body: 'Dig through cardboard, build one wall, and outlast the creeping heat. The toys are still taping this one together.',
        accent: PALETTE.coral,
      });
      break;
    case 'gate-dash':
      sfx.click();
      g.openPanel({
        kind: 'preview',
        title: 'Wind-Up Dash',
        subtitle: 'Track still being laid',
        body: 'A sprint through dominoes, ramps and snapping traps. Fully wound contestants only.',
        accent: PALETTE.toyBlue,
      });
      break;
    case 'pavilion':
      sfx.click();
      g.openPanel({
        kind: 'preview',
        title: 'Tournament Pavilion',
        subtitle: 'Party lobby — coming later',
        body: 'This is where groups of contenders will gather, pick a trial and line up for the next round. Solo play is open in the meantime.',
        accent: PALETTE.inkPurple,
      });
      break;
    case 'workshop':
      sfx.windUp(6);
      g.openWorkshop();
      break;
    case 'shop':
      sfx.click();
      g.openPanel({
        kind: 'shop',
        title: 'Odds & Ends Shop',
        subtitle: 'Closed for stock-take',
        body: 'Thimble helmets, bottle-cap crowns and button badges will be sold here once cosmetics are unlocked.',
        accent: PALETTE.sage,
      });
      break;
    case 'scoreboard':
      sfx.click();
      g.openPanel({ kind: 'scoreboard', title: 'Scoreboard', subtitle: 'Playroom records', accent: PALETTE.honey });
      break;
    case 'musicbox':
      sfx.musicBoxTune();
      events.emit('prop:musicbox-play');
      discover('musicbox', 'Forgotten music box');
      break;
    case 'marble':
      sfx.bump();
      events.emit('prop:marble-push', { dirX: facing.x, dirZ: facing.z });
      discover('marble', 'The rolling marble');
      break;
    case 'jack':
      events.emit('prop:jack-pop');
      discover('jack', 'Jack-in-the-box ambush');
      // Elimination is triggered by the prop after its pop animation.
      break;
    case 'key':
      if (!keyAvailable()) return;
      keyCooldownUntil = performance.now() + 15000;
      sfx.windUp(14);
      events.emit('prop:key-collected');
      events.emit('player:boost', { seconds: 8 });
      g.pushTicket({ title: 'Fully wound!', body: 'Speed boost for 8 seconds', tone: 'reward' });
      discover('key', 'The golden key');
      break;
  }
}
