/**
 * Quick "how to play" tutorials, one per minigame. Shown on the match intro card when a game comes
 * up (practice or tournament) unless the player has turned tutorials off; the intro card always
 * offers "How to play" to open one anyway. Settings → "Game tutorials" turns them back on.
 *
 * Keep each tutorial to 3–4 short steps. `touch` replaces `text` on touch devices when the controls
 * differ. Every playable game must have an entry (enforced by tests/unit/tutorials.test.ts).
 *
 * Every step also has a picture (`art`) that shows its rule at a glance, and `touchArt` where the
 * touch controls look different. Pictures are code-built SVG components in `src/ui/tutorialArt/`:
 * add a `<game>.tsx` there built from the shared kit (`kit.tsx`: toy, key caps, joystick, buttons,
 * arrows), export `{ '<game>-<step>': () => <Art>…</Art> }`, spread it into `TUTORIAL_ART` in
 * `src/ui/tutorialArt/index.tsx`, then name the ids here. Unknown ids fail the typecheck; the unit
 * test checks every step has a picture that renders. No baked-in text except key-cap and button
 * labels, palette colours only, and each picture must still explain its rule with motion off.
 */
import type { TutorialArtId } from '../ui/tutorialArt';
import type { MinigameId } from './types';

export interface TutorialStep {
  title: string;
  text: string;
  /** Replacement text for touch devices, when the controls differ. */
  touch?: string;
  /** The picture for this step (`src/ui/tutorialArt`). */
  art: TutorialArtId;
  /** Replacement picture for touch devices, when the controls look different. */
  touchArt?: TutorialArtId;
}

export const TUTORIALS: Partial<Record<MinigameId, TutorialStep[]>> = {
  'copycat-conductor': [
    { title: 'Watch the conductor', text: 'The conductor plays a tune on four instruments: drum, bell, xylophone and music box. Watch and listen.', art: 'copycat-watch' },
    { title: 'Play it back', text: 'Repeat the tune in the same order with A, S, J and K.', touch: 'Repeat the tune in the same order by tapping the four instrument pads.', art: 'copycat-play', touchArt: 'copycat-play-touch' },
    { title: 'A new tune every round', text: 'Every round plays a brand-new tune, one note longer and a little faster. A wrong note or running out of time knocks you out. Last toy playing wins.', art: 'copycat-grow' },
  ],
  'jack-in-the-box': [
    { title: 'Read the category', text: 'Each round has a category, like “Name a fruit”. The wind-up box is passed around the circle.', art: 'jackbox-category' },
    { title: 'Answer to pass it on', text: 'When you hold the box, type something that fits and hasn’t been said yet, then press Enter to crank it to the next toy.', touch: 'When you hold the box, type something that fits and hasn’t been said yet, then tap Crank! to pass it on.', art: 'jackbox-answer', touchArt: 'jackbox-answer-touch' },
    { title: 'Don’t get popped', text: 'A hidden fuse is ticking. When the jack pops, whoever is holding the box is out. Last toy in wins.', art: 'jackbox-pop' },
  ],
  'find-the-original': [
    { title: 'Meet Baldwyn', text: 'First you see the real Baldwyn, a wind-up gentleman built from different toy parts every match. Study him from hat to key: body, buttons, face and whatever he is carrying.', art: 'findoriginal-meet' },
    { title: 'Spot him in the crowd', text: 'A crowd of look-alikes shuffles in. Click the real Baldwyn, or move the ring with the arrows and press Enter.', touch: 'A crowd of look-alikes shuffles in. Tap the real Baldwyn. The card in the corner reminds you who to look for.', art: 'findoriginal-crowd', touchArt: 'findoriginal-crowd-touch' },
    { title: 'Fast, not reckless', text: 'Finding him first scores the most. Picking a fake costs points and stalls you for a moment. Five rounds, each one sneakier.', art: 'findoriginal-fast' },
  ],
  'red-light-green-light': [
    { title: 'Run on green', text: 'Race down the runway while the lamps are green and the Signalman has its back turned. Move with W A S D or the arrows.', touch: 'Race down the runway while the lamps are green and the Signalman has its back turned. Push the joystick up to run.', art: 'redlight-go', touchArt: 'redlight-go-touch' },
    { title: 'Listen for the ratchet', text: 'When the Signalman’s key starts to ratchet, it is about to turn round. Let go and stop dead before the lamps go red.', touch: 'When the Signalman’s key starts to ratchet, it is about to turn round. Let go of the joystick and stop before the lamps go red.', art: 'redlight-ratchet', touchArt: 'redlight-ratchet-touch' },
    { title: 'Caught moving?', text: 'Any toy still moving on red is flicked back to the start. First across the line wins.', art: 'redlight-caught' },
  ],
  'wind-up-dash': [
    { title: 'Sprint to the finish', text: 'Race across a tabletop obstacle course. Move with W A S D or the arrows, and jump with Space.', touch: 'Race across a tabletop obstacle course. Steer with the joystick and tap Jump to hop.', art: 'winddash-sprint', touchArt: 'winddash-sprint-touch' },
    { title: 'A new course every race', text: 'The road and its traps are dealt fresh each time. Look ahead: arrows, ramps and rulers show the quick way through, and a hop clears low things.', art: 'winddash-deal' },
    { title: 'Watch what moves', text: 'Anything that rattles, rolls, swings or lifts runs on a rhythm. Wait for your gap, then go. First toy across the line wins.', art: 'winddash-moves' },
  ],
  'inferno-escape': [
    { title: 'Dig in', text: 'You start in the middle of a field of blocks. Move with W A S D and press Space to break the block you are facing.', touch: 'You start in the middle of a field of blocks. Push the joystick to move and turn, and tap Break to clear the block you are facing.', art: 'inferno-dig', touchArt: 'inferno-dig-touch' },
    { title: 'One wall each', text: 'During the 15-second preparation you may place exactly one wall with R. Use it wisely: unused walls expire.', touch: 'During the 15-second preparation you may place exactly one wall with Build wall. Use it wisely: unused walls expire.', art: 'inferno-wall', touchArt: 'inferno-wall-touch' },
    { title: 'Outrun the furnace', text: 'Then the wind-up furnace rolls out and hunts the nearest toy, chewing through blocks and walls. If it touches you, you are out. Last survivor wins.', art: 'inferno-hunt' },
  ],
  'midnight-hunger': [
    { title: 'Energy always drains', text: 'Your energy bar runs down all the time. Reach zero and you are out. Last toy with energy wins.', art: 'midnight-drain' },
    { title: 'Hunt batteries by night', text: 'At night, face a battery bot and press Space three times to claim its charge. There is always one battery too few to go round.', touch: 'At night, face a battery bot and tap Hit three times to claim its charge. There is always one battery too few to go round.', art: 'midnight-night', touchArt: 'midnight-night-touch' },
    { title: 'Shelter by day', text: 'Daylight overheats you. Get under a green roofed shelter in a corner to slow the drain. Push rivals out of your way, or hold against a push to resist.', touch: 'Daylight overheats you. Steer with the joystick to a green roofed shelter in a corner. Push rivals out of your way, or hold the stick against a push to resist.', art: 'midnight-day', touchArt: 'midnight-day-touch' },
  ],
  'music-box-rhythm': [
    { title: 'Pins meet the line', text: 'Coloured pins ride the turning music box towards a bright line. Each colour is one lane.', art: 'rhythm-pins' },
    { title: 'Play on the beat', text: 'Press A, S, J or K as a pin crosses the line in its lane.', touch: 'Tap the matching pad as a pin crosses the line in its lane. Use both thumbs.', art: 'rhythm-play', touchArt: 'rhythm-play-touch' },
    { title: 'Build a combo', text: 'Perfect and Good hits build your combo up to ×4. A miss or a stray tap breaks it. Highest score wins. Taps feel late? Adjust the timing offset on this card.', art: 'rhythm-combo' },
  ],
  'blink-duel': [
    { title: 'One hit and you are out', text: 'Swords knock a toy out in a single hit. Last toy standing wins.', art: 'blink-hit' },
    { title: 'Blink to dodge', text: 'Space blinks you forward instantly, with no cooldown. Aim with W A S D or the mouse.', touch: 'Tap Blink to teleport forward instantly, with no cooldown. Steer to aim, or tap the arena.', art: 'blink-dodge', touchArt: 'blink-dodge-touch' },
    { title: 'Read the wind-up', text: 'A swing (J or click) charges for almost a second, and a striped cone shows where it will land. Blink out of cones, and blinking cancels your own swing.', touch: 'Swing charges for almost a second, and a striped cone shows where it will land. Blink out of cones, and blinking cancels your own swing.', art: 'blink-windup', touchArt: 'blink-windup-touch' },
  ],
  'spellbox-showdown': [
    { title: 'Pick your build', text: 'Take your time: pick one spell per button. R offers Blink: zip ahead and shove nearby toys away. Lock your build; the fight starts three seconds after everyone has locked in.', art: 'spellbox-draft' },
    { title: 'Push them out', text: 'Hits add damage, and the more damage a toy has, the further it flies. Cast with Q, E and R; aim with the mouse.', touch: 'Hits add damage, and the more damage a toy has, the further it flies. Tap your three spell buttons; tap the arena to aim.', art: 'spellbox-push', touchArt: 'spellbox-push-touch' },
    { title: 'Stay in the ring', text: 'Cross the edge and you are out. The ring shrinks as toys fall, with a warning first. Last toy inside wins.', art: 'spellbox-ring' },
  ],
  'toy-squad': [
    { title: 'Buy and sell toys', text: 'Spend coins on toys from the shop. Rerolling shows new offers. Drag a toy onto the shop, or select it and press Sell, to sell it. Card colours show rarity.', touch: 'Spend coins on toys from the shop. Rerolling shows new offers. Drag a toy onto the shop, or tap it and tap Sell, to sell it. Card colours show rarity.', art: 'toysquad-shop' },
    { title: 'Merge for stars', text: 'Matching toys merge automatically, up to three stars. Shop cards show the copies you own. Open the Toy Handbook to browse every toy and star your favourites.', art: 'toysquad-merge' },
    { title: 'Set your formation', text: 'Drag toys onto the board or keep them in reserve. Toys sharing a trait symbol earn bonuses, listed at the side. Then press Ready and your squad battles on its own.', touch: 'Drag toys onto the board or keep them in reserve. Toys sharing a trait symbol earn bonuses, listed at the side. Then tap Ready and your squad battles on its own.', art: 'toysquad-formation' },
    { title: 'Ten rounds', text: 'A win scores 3 points and a draw 1. Most points after ten rounds wins. On rounds 3, 6 and 9, you must pick one of three passive bonuses before you can carry on.', art: 'toysquad-rounds' },
  ],
  'odd-page-out': [
    { title: 'Two pages, nearly the same', text: 'The book shows one picture on each page. Fifteen things on the second page are different: a colour, a pattern, something missing, turned or moved.', art: 'spotdiff-pages' },
    { title: 'Circle them', text: 'Click a difference on either page to circle it. Or move the ring with the arrows and press Enter.', touch: 'Tap a difference on either page to circle it.', art: 'spotdiff-circle', touchArt: 'spotdiff-circle-touch' },
    { title: 'Careful, quick', text: 'Each find scores 10. A wrong tap holds you up for a second. Find all fifteen for a bonus: the first to finish gets the biggest.', art: 'spotdiff-score' },
    { title: 'Four pages', text: 'Each page lasts 30 seconds, and every page is a new scene. Most points after four pages wins.', art: 'spotdiff-four' },
  ],
  'toy-tower-tumble': [
    { title: 'Build random towers', text: 'Enemies walk the path on your 8×8 board. Build (B) pays 20 gold for a random tower on a felt square. Click a square first to choose where.', touch: 'Enemies walk the path on your 8×8 board. Tap a felt square, then Build here: 20 gold for a random tower.', art: 'towertumble-build', touchArt: 'towertumble-build-touch' },
    { title: 'Merge twins', text: 'Two identical towers merge into a random tower one tier up, to tier 7. Select one and click its glowing twin, or drag it onto the twin.', touch: 'Two identical towers merge into a random tower one tier up, to tier 7. Tap one, then its glowing twin, or drag it onto the twin.', art: 'towertumble-merge', touchArt: 'towertumble-merge-touch' },
    { title: 'Odds, quests and bosses', text: 'Level your builder for better odds. Quick quests pay gold. Bosses on waves 5, 10, 15 and 20 drop free high-tier towers.', art: 'towertumble-odds' },
    { title: 'Hold the line', text: 'Leaks cost lives; at zero you are out and can watch the other boards. Survive the most waves, or clear all 20, to win.', art: 'towertumble-hold' },
  ],
  'toybox-siege': [
    { title: 'Pick a toy and keep moving', text: 'Choose the Tin Soldier, the Pop-Gun Ranger or the Clockwork Wizard. Your weapons fire on their own: move with W A S D or the arrows to dodge the swarm.', touch: 'Choose the Tin Soldier, the Pop-Gun Ranger or the Clockwork Wizard. Your weapons fire on their own: steer with the joystick to dodge the swarm.' },
    { title: 'Grab gems, level up', text: 'Defeated toys drop gems. Collect them to level up and pick one card: a new weapon, a weapon upgrade or a passive. Everything goes up to level 5.' },
    { title: 'Elites, treasure and rivals', text: 'An elite arrives every minute and drops a chest. A maxed weapon plus its partner passive evolves when you open one. Or skip the chest to send an elite to a rival’s board.' },
    { title: 'Beat the Boiler Baron', text: 'The boss arrives at 4:00: defeat it to win. If you fall, you can spend points to revive once; after that you become a ghost and can inspect the other boards.' },
  ],
};

export function tutorialFor(id: MinigameId): TutorialStep[] | undefined {
  return TUTORIALS[id];
}
