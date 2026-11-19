/**
 * Quick "how to play" tutorials, one per minigame. Shown on the match intro card when a game comes
 * up (practice or tournament) unless the player has turned tutorials off; the intro card always
 * offers "How to play" to open one anyway. Settings → "Game tutorials" turns them back on.
 *
 * Keep each tutorial to 3–4 short steps. `touch` replaces `text` on touch devices when the controls
 * differ. Every playable game must have an entry (enforced by tests/unit/tutorials.test.ts).
 * Each step supplies a gameplay-photo caption and literal phrases to emphasize. Photo URLs stay
 * relative so the static build also works when hosted below a URL prefix.
 */
import type { MinigameId } from './types';

export interface TutorialStep {
  title: string;
  text: string;
  /** Replacement text for touch devices, when the controls differ. */
  touch?: string;
  /** Literal phrases to emphasize, in either control variant. No HTML in tutorial copy. */
  emphasis: string[];
  /** Caption for the real gameplay screenshot, also used as its alternative text. */
  caption: string;
  image: string;
}

const COPY: Partial<Record<MinigameId, Omit<TutorialStep, 'image'>[]>> = {
  'copycat-conductor': [
    { title: 'Watch the conductor', text: 'The conductor plays a tune on four instruments: drum, bell, xylophone and music box. Watch and listen.', emphasis: ["Watch and listen"], caption: "The conductor demonstrates a note on the four-instrument stage." },
    { title: 'Play it back', text: 'Repeat the tune in the same order with A, S, J and K.', touch: 'Repeat the tune in the same order by tapping the four instrument pads.', emphasis: ["same order","A, S, J and K","tapping the four instrument pads"], caption: "The instrument pads are ready for you to repeat the tune." },
    { title: 'A new tune every round', text: 'Every round plays a brand-new tune, one note longer and a little faster. A wrong note or running out of time knocks you out. Last toy playing wins.', emphasis: ["one note longer","A wrong note","running out of time"], caption: "A later round adds more notes; the round counter tracks your progress." },
  ],
  'jack-in-the-box': [
    { title: 'Read the category', text: 'Each round has a category, like “Name a fruit”. The wind-up box is passed around the circle.', emphasis: ["category"], caption: "The category card tells everyone which answers will count." },
    { title: 'Answer to pass it on', text: 'When you hold the box, type something that fits and hasn’t been said yet, then press Enter to crank it to the next toy.', touch: 'When you hold the box, type something that fits and hasn’t been said yet, then tap Crank! to pass it on.', emphasis: ["hasn’t been said yet","Enter","Crank!"], caption: "The answer field and Crank button appear when you hold the box." },
    { title: 'Don’t get popped', text: 'A hidden fuse is ticking. When the jack pops, whoever is holding the box is out. Last toy in wins.', emphasis: ["hidden fuse","holding the box"], caption: "The jack springs out and eliminates the toy holding the box." },
  ],
  'find-the-original': [
    { title: 'Meet Baldwyn', text: 'First you see the real Baldwyn, a wind-up gentleman built from different toy parts every match. Study him from hat to key: body, buttons, face and whatever he is carrying.', emphasis: ["Study him from hat to key"], caption: "Study Baldwyn alone before the look-alikes arrive." },
    { title: 'Spot him in the crowd', text: 'A crowd of look-alikes shuffles in. Click the real Baldwyn, or move the ring with the arrows and press Enter.', touch: 'A crowd of look-alikes shuffles in. Tap the real Baldwyn. The card in the corner reminds you who to look for.', emphasis: ["Click the real Baldwyn","arrows","Enter","Tap the real Baldwyn"], caption: "Compare the crowd with Baldwyn’s reference card in the corner." },
    { title: 'Fast, not reckless', text: 'Finding him first scores the most. Picking a fake costs points and stalls you for a moment. Five rounds, each one sneakier.', emphasis: ["costs points","Five rounds"], caption: "The revealed original shows which toy was the right choice." },
  ],
  'red-light-green-light': [
    { title: 'Run on green', text: 'Race down the runway while the lamps are green and the Signalman has its back turned. Move with W A S D or the arrows.', touch: 'Race down the runway while the lamps are green and the Signalman has its back turned. Push the joystick up to run.', emphasis: ["green","W A S D","arrows","joystick"], caption: "Green lamps and the turned-away Signalman mean it is safe to run." },
    { title: 'Listen for the ratchet', text: 'When the Signalman’s key starts to ratchet, it is about to turn round. Let go and stop dead before the lamps go red.', touch: 'When the Signalman’s key starts to ratchet, it is about to turn round. Let go of the joystick and stop before the lamps go red.', emphasis: ["Let go","stop","ratchet"], caption: "Amber lamps warn that the Signalman is turning: release movement." },
    { title: 'Caught moving?', text: 'Any toy still moving on red is flicked back to the start. First across the line wins.', emphasis: ["moving on red","back to the start"], caption: "Red lamps mean stop; a caught toy is flicked back down the runway." },
  ],
  'wind-up-dash': [
    { title: 'Sprint to the finish', text: 'Race across a tabletop obstacle course. Move with W A S D or the arrows, and jump with Space.', touch: 'Race across a tabletop obstacle course. Steer with the joystick and tap Jump to hop.', emphasis: ["W A S D","arrows","Space","joystick","Jump"], caption: "The chase camera follows your toy down the obstacle course." },
    { title: 'A new course every race', text: 'The road and its traps are dealt fresh each time. Look ahead: arrows, ramps and rulers show the quick way through, and a hop clears low things.', emphasis: ["Look ahead","a hop clears low things"], caption: "Ramps, gaps and tabletop props offer routes through the course." },
    { title: 'Watch what moves', text: 'Anything that rattles, rolls, swings or lifts runs on a rhythm. Wait for your gap, then go. First toy across the line wins.', emphasis: ["rhythm","Wait for your gap"], caption: "Moving traps need timing: watch the obstacle before crossing." },
  ],
  'inferno-escape': [
    { title: 'Dig in', text: 'You start in the middle of a field of blocks. Move with W A S D and press Space to break the block you are facing.', touch: 'You start in the middle of a field of blocks. Push the joystick to move and turn, and tap Break to clear the block you are facing.', emphasis: ["W A S D","Space","joystick","Break"], caption: "Face a rock beside the central clearing to break a way out." },
    { title: 'One wall each', text: 'During the 15-second preparation you may place exactly one wall with R. Use it wisely: unused walls expire.', touch: 'During the 15-second preparation you may place exactly one wall with Build wall. Use it wisely: unused walls expire.', emphasis: ["15-second","exactly one wall","with R","Build wall"], caption: "A placed wall blocks a square and uses your one preparation wall." },
    { title: 'Outrun the furnace', text: 'Then the wind-up furnace rolls out and hunts the nearest toy, chewing through blocks and walls. If it touches you, you are out. Last survivor wins.', emphasis: ["hunts the nearest toy","If it touches you"], caption: "The furnace enters the cleared corridors and pursues the toys." },
  ],
  'midnight-hunger': [
    { title: 'Energy always drains', text: 'Your energy bar runs down all the time. Reach zero and you are out. Last toy with energy wins.', emphasis: ["energy bar","Reach zero"], caption: "The energy meter and bars above the toys show remaining charge." },
    { title: 'Hunt batteries by night', text: 'At night, face a battery bot and press Space three times to claim its charge. There is always one battery too few to go round.', touch: 'At night, face a battery bot and tap Hit three times to claim its charge. There is always one battery too few to go round.', emphasis: ["Space three times","Hit three times","one battery too few"], caption: "Face a battery bot; its hit markers show progress toward three hits." },
    { title: 'Shelter by day', text: 'Daylight overheats you. Get under a green roofed shelter in a corner to slow the drain. Push rivals out of your way, or hold against a push to resist.', touch: 'Daylight overheats you. Steer with the joystick to a green roofed shelter in a corner. Push rivals out of your way, or hold the stick against a push to resist.', emphasis: ["green roofed shelter","resist"], caption: "Green corner roofs offer shelter from the draining daylight." },
  ],
  'music-box-rhythm': [
    { title: 'Pins meet the line', text: 'Coloured pins ride the turning music box towards a bright line. Each colour is one lane.', emphasis: ["bright line","one lane"], caption: "Coloured pins approach the judgement line in four separate lanes." },
    { title: 'Play on the beat', text: 'Press A, S, J or K as a pin crosses the line in its lane.', touch: 'Tap the matching pad as a pin crosses the line in its lane. Use both thumbs.', emphasis: ["A, S, J or K","crosses the line","matching pad"], caption: "Hit the matching lane when its pin reaches the bright line." },
    { title: 'Build a combo', text: 'Perfect and Good hits build your combo up to ×4. A miss or a stray tap breaks it. Highest score wins. Taps feel late? Adjust the timing offset on this card.', emphasis: ["×4","breaks it","timing offset"], caption: "The combo and multiplier reward a streak of accurate lane hits." },
  ],
  'blink-duel': [
    { title: 'One hit and you are out', text: 'Swords knock a toy out in a single hit. Last toy standing wins.', emphasis: ["single hit","Last toy standing"], caption: "The sword arena shows the remaining contenders." },
    { title: 'Blink to dodge', text: 'Space blinks you forward instantly, with no cooldown. Aim with W A S D or the mouse.', touch: 'Tap Blink to teleport forward instantly, with no cooldown. Steer to aim, or tap the arena.', emphasis: ["Space","no cooldown","Blink","Steer to aim"], caption: "A blink leaves a trail as your toy instantly crosses the arena." },
    { title: 'Read the wind-up', text: 'A swing (J or click) charges for almost a second, and a striped cone shows where it will land. Blink out of cones, and blinking cancels your own swing.', touch: 'Swing charges for almost a second, and a striped cone shows where it will land. Blink out of cones, and blinking cancels your own swing.', emphasis: ["J or click","striped cone","cancels your own swing"], caption: "Striped attack cones reveal where the next sword swing will land." },
  ],
  'spellbox-showdown': [
    { title: 'Pick your build', text: 'Take your time: pick one spell per button. R offers Blink: zip ahead and shove nearby toys away. Lock your build; the fight starts three seconds after everyone has locked in.', emphasis: ["one spell per button","Lock your build"], caption: "Choose a spell for each of the three slots before locking in." },
    { title: 'Push them out', text: 'Hits add damage, and the more damage a toy has, the further it flies. Cast with Q, E and R; aim with the mouse.', touch: 'Hits add damage, and the more damage a toy has, the further it flies. Tap your three spell buttons; tap the arena to aim.', emphasis: ["more damage","Q, E and R","three spell buttons"], caption: "A spell hit raises damage and knocks a rival toward the edge." },
    { title: 'Stay in the ring', text: 'Cross the edge and you are out. The ring shrinks as toys fall, with a warning first. Last toy inside wins.', emphasis: ["Cross the edge","ring shrinks","warning"], caption: "The shrinking-ring warning shows the next arena boundary." },
  ],
  'toy-squad': [
    { title: 'Buy and sell toys', text: 'Spend coins on toys from the shop. Rerolling shows new offers. Drag a toy onto the shop, or select it and press Sell, to sell it. Card colours show rarity.', touch: 'Spend coins on toys from the shop. Rerolling shows new offers. Drag a toy onto the shop, or tap it and tap Sell, to sell it. Card colours show rarity.', emphasis: ["coins","Rerolling","Sell"], caption: "The shop offers toys, prices and a reroll button beneath your board." },
    { title: 'Merge for stars', text: 'Matching toys merge automatically, up to three stars. Shop cards show the copies you own. Open the Toy Handbook to browse every toy and star your favourites.', emphasis: ["merge automatically","three stars","Toy Handbook"], caption: "Buying a matching copy upgrades an owned toy and adds a star." },
    { title: 'Set your formation', text: 'Drag toys onto the board or keep them in reserve. Toys sharing a trait symbol earn bonuses, listed at the side. Then press Ready and your squad battles on its own.', touch: 'Drag toys onto the board or keep them in reserve. Toys sharing a trait symbol earn bonuses, listed at the side. Then tap Ready and your squad battles on its own.', emphasis: ["Drag toys","trait symbol","Ready"], caption: "Deployed toys share the board; trait badges explain team bonuses." },
    { title: 'Ten rounds', text: 'A win scores 3 points and a draw 1. Most points after ten rounds wins. On rounds 3, 6 and 9, you must pick one of three passive bonuses before you can carry on.', emphasis: ["ten rounds","3, 6 and 9","passive bonuses"], caption: "On a passive round, choose one of three bonuses for your squad." },
  ],
  'odd-page-out': [
    { title: 'Two pages, nearly the same', text: 'The book shows one picture on each page. Fifteen things on the second page are different: a colour, a pattern, something missing, turned or moved.', emphasis: ["Fifteen things","second page"], caption: "Compare the two pictures in the open storybook." },
    { title: 'Circle them', text: 'Click a difference on either page to circle it. Or move the ring with the arrows and press Enter.', touch: 'Tap a difference on either page to circle it.', emphasis: ["either page","arrows","Enter","Tap a difference"], caption: "A correct find is circled in the matching spot on both pages." },
    { title: 'Careful, quick', text: 'Each find scores 10. A wrong tap holds you up for a second. Find all fifteen for a bonus: the first to finish gets the biggest.', emphasis: ["10","wrong tap","bonus"], caption: "Found differences gain green circles and increase your score." },
    { title: 'Four pages', text: 'Each page lasts 30 seconds, and every page is a new scene. Most points after four pages wins.', emphasis: ["30 seconds","four pages"], caption: "The page counter and timer track the four-picture match." },
  ],
  'toy-tower-tumble': [
    { title: 'Build random towers', text: 'Enemies walk the path on your 8×8 board. Build (B) pays 20 gold for a random tower on a felt square. Click a square first to choose where.', touch: 'Enemies walk the path on your 8×8 board. Tap a felt square, then Build here: 20 gold for a random tower.', emphasis: ["Build (B)","20 gold","Build here"], caption: "Build a random tower on a green felt square beside the enemy path." },
    { title: 'Merge by tier', text: 'Any two same-tier towers merge into a random tower one tier up, to tier 7. Press M to merge a pair automatically, or select one and click or drag onto a glowing partner.', touch: 'Any two towers of the same tier merge into a random tower one tier up, to tier 7. Tap one, then a glowing same-tier tower, or drag it onto one.', emphasis: ["same-tier","M","tier 7"], caption: "Same-tier towers glow as merge partners, even when their types differ." },
    { title: 'Odds, quests and bosses', text: 'Level your builder for better odds. Quick quests pay gold. Bosses on waves 5, 10, 15 and 20 drop free high-tier towers.', emphasis: ["Level your builder","Quick quests","5, 10, 15 and 20"], caption: "Builder upgrades improve odds; the quest list shows gold rewards." },
    { title: 'Hold the line', text: 'Leaks cost lives; at zero you are out and can watch the other boards. Survive the most waves, or clear all 20, to win.', emphasis: ["Leaks cost lives","at zero","most waves"], caption: "Towers fire at enemies following the path; leaks reduce your lives." },
  ],
};

export const TUTORIALS = Object.fromEntries(Object.entries(COPY).map(([id, steps]) => [id,
  steps.map((step, i) => ({ ...step, image: `./assets/ui/tutorials/${id}-${i + 1}.webp` })),
])) as Partial<Record<MinigameId, TutorialStep[]>>;

/** Split literal phrases into safe text/strong segments for both keyboard and touch copy. */
export function tutorialText(text: string, phrases: string[]): { text: string; strong: boolean }[] {
  const matches = phrases.filter(Boolean).sort((a, b) => b.length - a.length);
  const parts: { text: string; strong: boolean }[] = [];
  let plain = '';
  for (let i = 0; i < text.length;) {
    const phrase = matches.find(p => text.startsWith(p, i));
    if (phrase) {
      if (plain) parts.push({ text: plain, strong: false });
      parts.push({ text: phrase, strong: true }); plain = ''; i += phrase.length;
    } else plain += text[i++];
  }
  if (plain) parts.push({ text: plain, strong: false });
  return parts;
}

export function tutorialFor(id: MinigameId): TutorialStep[] | undefined {
  return TUTORIALS[id];
}
