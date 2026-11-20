/**
 * Hub interactables: data + handlers. The player controller finds the nearest one in range,
 * shows a prompt, and calls `interact(id)` on E. Scene props listen on the event bus for
 * their visual reaction.
 */
import { events } from './events';
import { sfx } from './audio';
import { useGame } from './store';
import { PALETTE } from './palette';
import { SECRET_IDS, rewardForSecret } from './cosmetics';
import { EARN } from './economy';
import { exposeDebug } from './debug';
import { openPractice } from '../minigames/session';
import { BALL, MARBLE } from './hubPlay';
import { ballFree, ballInAir, canSnatch, canSteal, grab, iHold, kick, startCharge } from '../hubplay/runtime';
import { JACK_SPOT } from './whoAmI';
import { useNet } from '../net/store';
import { requestCard, wearingCard } from '../net/chat';
import { CHAT_NOTE_TEXT } from '../net/protocol';
import { GATES, GATE_STAND, JUKEBOX, MUSICBOX, PAVILION, PIPWICK_HOME, SCOREBOARD, SHOP, TOWER, TV, WORKSHOP, frontOf } from '../scene/layout';

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

export { SECRET_IDS };

let keyCooldownUntil = 0;
export const keyAvailable = () => performance.now() > keyCooldownUntil;

export const INTERACTABLES: Interactable[] = [
  // one gate per playable trial: E / Interact opens that trial's lobby (the practice intro card)
  ...GATES.map((g) => ({ id: g.id, ...frontOf(g.x, g.z, g.rot, GATE_STAND), radius: 4.5, verb: 'Play', label: g.title })),
  { id: 'pavilion', ...frontOf(PAVILION.x, PAVILION.z, PAVILION.rot, PAVILION.d / 2 + 3), radius: 4.5, verb: 'Enter', label: 'the Tournament Pavilion' },
  { id: 'workshop', ...frontOf(WORKSHOP.x, WORKSHOP.z, WORKSHOP.rot, WORKSHOP.d / 2 + 2.5), radius: 5, verb: 'Tinker at', label: 'the Workshop' },
  { id: 'shop', ...frontOf(SHOP.x, SHOP.z, SHOP.rot, SHOP.d / 2 + 6), radius: 5, verb: 'Browse', label: 'Odds & Ends Shop' },
  { id: 'scoreboard', ...frontOf(SCOREBOARD.x, SCOREBOARD.z, SCOREBOARD.rot, 3.5), radius: 5, verb: 'Read', label: 'the Scoreboard' },
  { id: 'tv', ...frontOf(TV.x, TV.z, TV.rot, TV.d / 2 + 2.6), radius: 3.2, verb: 'Change channel on', label: 'the TV' },
  // Pipwick, the welcome mascot (talk to replay the tour), and the Jukebox (pick the Hub's music)
  { id: 'pipwick', ...frontOf(PIPWICK_HOME.x, PIPWICK_HOME.z, PIPWICK_HOME.yaw, 2.3), radius: 3.6, verb: 'Talk to', label: 'Pipwick' },
  { id: 'jukebox', ...frontOf(JUKEBOX.x, JUKEBOX.z, JUKEBOX.rot, JUKEBOX.d / 2 + 2.4), radius: 4, verb: 'Choose music at', label: 'the Jukebox' },
  // hidden
  { id: 'musicbox', x: MUSICBOX.x, z: MUSICBOX.z + 3, radius: 3.4, verb: 'Crank', label: 'a forgotten music box', secret: true },
  { id: 'marble', x: MARBLE.home.x, z: MARBLE.home.z, radius: 3.6, verb: 'Kick', label: 'the giant marble', secret: true },
  // the basketball by the hoop on the trials table: pick it up, then hold Interact to throw
  { id: 'ball', x: BALL.spot.x, z: BALL.spot.z, radius: 3.0, verb: 'Pick up', label: 'the basketball', disabled: () => !ballFree() || ballInAir() },
  // ...catch it in mid-air (anyone's throw or rebound), or take it off a toy dribbling it (online)
  { id: 'ball-snatch', x: BALL.spot.x, z: BALL.spot.z, radius: 3.5, verb: 'Snatch', label: 'the basketball', disabled: () => !canSnatch() },
  { id: 'ball-steal', x: BALL.spot.x, z: BALL.spot.z, radius: 3.5, verb: 'Steal', label: 'the basketball', disabled: () => !canSteal() },
  // (while you hold it: its live spot sits 2.9 cm ahead of you, so a nearer prompt such as a gate wins)
  { id: 'ball-throw', x: BALL.spot.x, z: BALL.spot.z, radius: 3, verb: 'Hold to throw', label: 'the basketball', disabled: () => !iHold() },
  { id: 'jack', x: JACK_SPOT.x, z: JACK_SPOT.z, radius: JACK_SPOT.radius, verb: 'Open', label: 'a suspicious box', secret: true },
  { id: 'key', x: TOWER.block.x, z: TOWER.block.z, radius: 2.4, verb: 'Grab', label: 'the golden key', secret: true, minY: TOWER.block.top - 0.5, disabled: () => !keyAvailable() },
];

// ?debug only: where each interactable is (e.g. tests teleport next to the shop's prompt).
exposeDebug({ interactables: () => INTERACTABLES.map(({ id, x, z, radius, verb, label }) => ({ id, x, z, radius, verb, label })) });

/** Live position overrides for movable interactables (the marble rolls, the ball is carried). */
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
      body: `${name}: ${n}/${SECRET_IDS.length} playroom secrets${reward ? `. Unlocked: ${reward} (Workshop)` : ''}. +${EARN.secret} cogs`,
      tone: 'reward',
    });
  }
}

export function interact(id: string, facing: { x: number; z: number }) {
  const g = useGame.getState();
  events.emit('player:interact');

  const gate = GATES.find((x) => x.id === id);
  if (gate) {
    sfx.interact();
    events.emit('gate:open', { id });
    openPractice(gate.game);
    return;
  }

  switch (id) {
    case 'pavilion':
      sfx.click();
      g.openPanel({ kind: 'tournament', title: 'Tournament Pavilion', subtitle: 'Pick a format', accent: PALETTE.inkPurple });
      break;
    case 'workshop':
      sfx.windUp(6);
      g.openWorkshop();
      break;
    case 'shop':
      sfx.purchase();
      g.openShop();
      break;
    case 'tv':
      sfx.click();
      events.emit('tv:next');
      break;
    case 'pipwick':
      sfx.interact();
      events.emit('pipwick:talk'); // src/game/welcome.ts opens the chat
      break;
    case 'jukebox':
      sfx.crank(0);
      events.emit('prop:jukebox-crank');
      g.openPanel({ kind: 'jukebox', title: 'The Jukebox', subtitle: 'Pick the music for the Hub', accent: PALETTE.honey });
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
      kick(facing.x, facing.z, 1);
      events.emit('prop:marble-push', { dirX: facing.x, dirZ: facing.z });
      discover('marble', 'The rolling marble');
      break;
    case 'ball':
    case 'ball-snatch':
    case 'ball-steal':
      grab();
      break;
    case 'ball-throw':
      startCharge();
      break;
    case 'jack':
      if (useNet.getState().status === 'online') {
        // Online: Who Am I? The jack slaps a card (dealt by the server) on your face; no ambush.
        if (wearingCard()) {
          sfx.reject();
          g.pushTicket({ title: 'Who Am I?', body: CHAT_NOTE_TEXT.card_busy, tone: 'info' });
          return;
        }
        events.emit('prop:jack-card');
        discover('jack', 'Jack-in-the-box ambush');
        requestCard();
        break;
      }
      events.emit('prop:jack-pop');
      discover('jack', 'Jack-in-the-box ambush');
      // Elimination is triggered by the prop after its pop animation.
      g.pushTicket({ title: 'Who Am I?', body: 'This box also plays Who Am I? with other players. Join the online Hub to try it.', tone: 'info' });
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
