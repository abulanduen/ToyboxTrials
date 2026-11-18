/**
 * Quick "how to play" tutorials, one per minigame. Shown on the match intro card when a game comes
 * up (practice or tournament) unless the player has turned tutorials off; the intro card always
 * offers "How to play" to open one anyway. Settings → "Game tutorials" turns them back on.
 *
 * Keep each tutorial to 3–4 short steps. `touch` replaces `text` on touch devices when the controls
 * differ. Every playable game must have an entry (enforced by tests/unit/tutorials.test.ts).
 */
import type { MinigameId } from './types';

export interface TutorialStep {
  title: string;
  text: string;
  /** Replacement text for touch devices, when the controls differ. */
  touch?: string;
}

export const TUTORIALS: Partial<Record<MinigameId, TutorialStep[]>> = {
  'copycat-conductor': [
    { title: 'Watch the conductor', text: 'The conductor plays a tune on four instruments: drum, bell, xylophone and music box. Watch and listen.' },
    { title: 'Play it back', text: 'Repeat the tune in the same order with A, S, J and K.', touch: 'Repeat the tune in the same order by tapping the four instrument pads.' },
    { title: 'A new tune every round', text: 'Every round plays a brand-new tune, one note longer and a little faster. A wrong note or running out of time knocks you out. Last toy playing wins.' },
  ],
  'jack-in-the-box': [
    { title: 'Read the category', text: 'Each round has a category, like “Name a fruit”. The wind-up box is passed around the circle.' },
    { title: 'Answer to pass it on', text: 'When you hold the box, type something that fits and hasn’t been said yet, then press Enter to crank it to the next toy.', touch: 'When you hold the box, type something that fits and hasn’t been said yet, then tap Crank! to pass it on.' },
    { title: 'Don’t get popped', text: 'A hidden fuse is ticking. When the jack pops, whoever is holding the box is out. Last toy in wins.' },
  ],
  'find-the-original': [
    { title: 'Meet Baldwyn', text: 'First you see the real Baldwyn, a wind-up gentleman. Remember his hat, buttons and key.' },
    { title: 'Spot him in the crowd', text: 'A crowd of look-alikes shuffles in. Click the real Baldwyn, or move the ring with the arrows and press Enter.', touch: 'A crowd of look-alikes shuffles in. Tap the real Baldwyn. The card in the corner reminds you who to look for.' },
    { title: 'Fast, not reckless', text: 'Finding him first scores the most. Picking a fake costs points and stalls you for a moment. Five rounds, each one sneakier.' },
  ],
  'red-light-green-light': [
    { title: 'Run on green', text: 'Race down the runway while the lamps are green and the Signalman has its back turned. Move with W A S D or the arrows.', touch: 'Race down the runway while the lamps are green and the Signalman has its back turned. Push the joystick up to run.' },
    { title: 'Listen for the ratchet', text: 'When the Signalman’s key starts to ratchet, it is about to turn round. Let go and stop dead before the lamps go red.', touch: 'When the Signalman’s key starts to ratchet, it is about to turn round. Let go of the joystick and stop before the lamps go red.' },
    { title: 'Caught moving?', text: 'Any toy still moving on red is flicked back to the start. First across the line wins.' },
  ],
  'wind-up-dash': [
    { title: 'Sprint to the finish', text: 'Race across a tabletop obstacle course. Move with W A S D or the arrows, and jump with Space.', touch: 'Race across a tabletop obstacle course. Steer with the joystick and tap Jump to hop.' },
    { title: 'A new course every race', text: 'The road and its traps are dealt fresh each time. Look ahead: arrows, ramps and rulers show the quick way through, and a hop clears low things.' },
    { title: 'Watch what moves', text: 'Anything that rattles, rolls, swings or lifts runs on a rhythm. Wait for your gap, then go. First toy across the line wins.' },
  ],
  'inferno-escape': [
    { title: 'Dig in', text: 'You start in the middle of a field of blocks. Move with W A S D and press Space to break the block you are facing.', touch: 'You start in the middle of a field of blocks. Push the joystick to move and turn, and tap Break to clear the block you are facing.' },
    { title: 'One wall each', text: 'During the 15-second preparation you may place exactly one wall with R. Use it wisely: unused walls expire.', touch: 'During the 15-second preparation you may place exactly one wall with Build wall. Use it wisely: unused walls expire.' },
    { title: 'Outrun the furnace', text: 'Then the wind-up furnace rolls out and hunts the nearest toy, chewing through blocks and walls. If it touches you, you are out. Last survivor wins.' },
  ],
  'midnight-hunger': [
    { title: 'Energy always drains', text: 'Your energy bar runs down all the time. Reach zero and you are out. Last toy with energy wins.' },
    { title: 'Hunt batteries by night', text: 'At night, face a battery bot and press Space three times to claim its charge. There is always one battery too few to go round.', touch: 'At night, face a battery bot and tap Hit three times to claim its charge. There is always one battery too few to go round.' },
    { title: 'Shelter by day', text: 'Daylight overheats you. Get under a green roofed shelter in a corner to slow the drain. Push rivals out of your way, or hold against a push to resist.', touch: 'Daylight overheats you. Steer with the joystick to a green roofed shelter in a corner. Push rivals out of your way, or hold the stick against a push to resist.' },
  ],
  'music-box-rhythm': [
    { title: 'Pins meet the line', text: 'Coloured pins ride the turning music box towards a bright line. Each colour is one lane.' },
    { title: 'Play on the beat', text: 'Press A, S, J or K as a pin crosses the line in its lane.', touch: 'Tap the matching pad as a pin crosses the line in its lane. Use both thumbs.' },
    { title: 'Build a combo', text: 'Perfect and Good hits build your combo up to ×4. A miss or a stray tap breaks it. Highest score wins. Taps feel late? Adjust the timing offset on this card.' },
  ],
  'blink-duel': [
    { title: 'One hit and you are out', text: 'Swords knock a toy out in a single hit. Last toy standing wins.' },
    { title: 'Blink to dodge', text: 'Space blinks you forward instantly, with no cooldown. Aim with W A S D or the mouse.', touch: 'Tap Blink to teleport forward instantly, with no cooldown. Steer to aim, or tap the arena.' },
    { title: 'Read the wind-up', text: 'A swing (J or click) charges for almost a second, and a striped cone shows where it will land. Blink out of cones, and blinking cancels your own swing.', touch: 'Swing charges for almost a second, and a striped cone shows where it will land. Blink out of cones, and blinking cancels your own swing.' },
  ],
  'spellbox-showdown': [
    { title: 'Pick your build', text: 'Before the fight, choose one spell for each of your three buttons, then press Ready.' },
    { title: 'Push them out', text: 'Hits add damage, and the more damage a toy has, the further it flies. Cast with Q, E and R; aim with the mouse.', touch: 'Hits add damage, and the more damage a toy has, the further it flies. Tap your three spell buttons; tap the arena to aim.' },
    { title: 'Stay in the ring', text: 'Cross the edge and you are out. The ring shrinks as toys fall, with a warning first. Last toy inside wins.' },
  ],
  'toy-squad': [
    { title: 'Buy toys', text: 'Spend coins on toys from the shop. Rerolling shows new offers for a few coins. Your level decides which rarities appear.' },
    { title: 'Merge for stars', text: 'Collecting matching toys merges them automatically, up to three stars. Stronger toys hit harder and last longer.' },
    { title: 'Set your formation', text: 'Drag toys onto the board to deploy them, or keep them in reserve. Then press Ready and your squad battles on its own.', touch: 'Drag toys onto the board to deploy them, or keep them in reserve. Then tap Ready and your squad battles on its own.' },
    { title: 'Ten rounds', text: 'A win scores 3 points and a draw 1. Most points after ten rounds wins. On rounds 3, 6 and 9, choose a passive bonus before you press Ready.' },
  ],
};

export function tutorialFor(id: MinigameId): TutorialStep[] | undefined {
  return TUTORIALS[id];
}
