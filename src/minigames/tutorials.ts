/**
 * Quick "how to play" tutorials, one per minigame. Shown on the match intro card when a game comes
 * up (practice or tournament) unless the player has turned tutorials off; the intro card always
 * offers "How to play" to open one anyway. Settings → "Game tutorials" turns them back on.
 *
 * Keep each tutorial to 3–4 short steps. `touch` replaces `text` on touch devices when the controls
 * differ. Every playable game must have an entry (enforced by tests/unit/tutorials.test.ts).
 *
 * Gameplay photo URLs are relative for static hosting below a URL prefix.
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
  /** Literal phrases emphasized in the keyboard or touch explanation. */
  emphasis: string[];
  /** Optional real gameplay photo. Without one, the SVG picture remains the visual aid. */
  image?: string;
  caption?: string;
}

export const TUTORIALS: Partial<Record<MinigameId, TutorialStep[]>> = {
  'copycat-conductor': [
    {"title":"Watch the conductor","text":"The conductor plays a tune on four instruments: drum, bell, xylophone and music box. Watch and listen.","art":"copycat-watch","emphasis":["Watch and listen"],"caption":"The conductor demonstrates a note on the four-instrument stage.","image":"./assets/ui/tutorials/copycat-conductor-1.webp"},
    {"title":"Play it back","text":"Repeat the tune in the same order with A, S, J and K.","touch":"Repeat the tune in the same order by tapping the four instrument pads.","art":"copycat-play","touchArt":"copycat-play-touch","emphasis":["same order","A, S, J and K","tapping the four instrument pads"],"caption":"The instrument pads are ready for you to repeat the tune.","image":"./assets/ui/tutorials/copycat-conductor-2.webp"},
    {"title":"A new tune every round","text":"Every round plays a brand-new tune, one note longer and a little faster. A wrong note or running out of time knocks you out. Last toy playing wins.","art":"copycat-grow","emphasis":["one note longer","A wrong note","running out of time"],"caption":"A later round adds more notes; the round counter tracks your progress.","image":"./assets/ui/tutorials/copycat-conductor-3.webp"},
  ],
  'jack-in-the-box': [
    {"title":"Read the category","text":"Each round has a category, like “Name a fruit”. The wind-up box is passed around the circle.","art":"jackbox-category","emphasis":["category"],"caption":"The category card tells everyone which answers will count.","image":"./assets/ui/tutorials/jack-in-the-box-1.webp"},
    {"title":"Answer to pass it on","text":"When you hold the box, type something that fits and hasn’t been said yet, then press Enter to crank it to the next toy.","touch":"When you hold the box, type something that fits and hasn’t been said yet, then tap Crank! to pass it on.","art":"jackbox-answer","touchArt":"jackbox-answer-touch","emphasis":["hasn’t been said yet","Enter","Crank!"],"caption":"The answer field and Crank button appear when you hold the box.","image":"./assets/ui/tutorials/jack-in-the-box-2.webp"},
    {"title":"Don’t get popped","text":"A hidden fuse is ticking. When the jack pops, whoever is holding the box is out. Last toy in wins.","art":"jackbox-pop","emphasis":["hidden fuse","holding the box"],"caption":"The jack springs out and eliminates the toy holding the box.","image":"./assets/ui/tutorials/jack-in-the-box-3.webp"},
  ],
  'find-the-original': [
    {"title":"Meet Baldwyn","text":"First you see the real Baldwyn, a wind-up gentleman built from different toy parts every match. Study him from hat to key: body, buttons, face and whatever he is carrying.","art":"findoriginal-meet","emphasis":["Study him from hat to key"],"caption":"Study Baldwyn alone before the look-alikes arrive.","image":"./assets/ui/tutorials/find-the-original-1.webp"},
    {"title":"Spot him in the crowd","text":"A crowd of look-alikes shuffles in. Click the real Baldwyn, or move the ring with the arrows and press Enter.","touch":"A crowd of look-alikes shuffles in. Tap the real Baldwyn. The card in the corner reminds you who to look for.","art":"findoriginal-crowd","touchArt":"findoriginal-crowd-touch","emphasis":["Click the real Baldwyn","arrows","Enter","Tap the real Baldwyn"],"caption":"Compare the crowd with Baldwyn’s reference card in the corner.","image":"./assets/ui/tutorials/find-the-original-2.webp"},
    {"title":"Fast, not reckless","text":"Finding him first scores the most. Picking a fake costs points and stalls you for a moment. Five rounds, each one sneakier.","art":"findoriginal-fast","emphasis":["costs points","Five rounds"],"caption":"The revealed original shows which toy was the right choice.","image":"./assets/ui/tutorials/find-the-original-3.webp"},
  ],
  'red-light-green-light': [
    {"title":"Run on green","text":"Race down the runway while the lamps are green and the Signalman has its back turned. Move with W A S D or the arrows.","touch":"Race down the runway while the lamps are green and the Signalman has its back turned. Push the joystick up to run.","art":"redlight-go","touchArt":"redlight-go-touch","emphasis":["green","W A S D","arrows","joystick"],"caption":"Green lamps and the turned-away Signalman mean it is safe to run.","image":"./assets/ui/tutorials/red-light-green-light-1.webp"},
    {"title":"Listen for the ratchet","text":"When the Signalman’s key starts to ratchet, it is about to turn round. Let go and stop dead before the lamps go red.","touch":"When the Signalman’s key starts to ratchet, it is about to turn round. Let go of the joystick and stop before the lamps go red.","art":"redlight-ratchet","touchArt":"redlight-ratchet-touch","emphasis":["Let go","stop","ratchet"],"caption":"Amber lamps warn that the Signalman is turning: release movement.","image":"./assets/ui/tutorials/red-light-green-light-2.webp"},
    {"title":"Caught moving?","text":"Any toy still moving on red is flicked back to the start. First across the line wins.","art":"redlight-caught","emphasis":["moving on red","back to the start"],"caption":"Red lamps mean stop; a caught toy is flicked back down the runway.","image":"./assets/ui/tutorials/red-light-green-light-3.webp"},
  ],
  'wind-up-dash': [
    {"title":"Sprint to the finish","text":"Race across a tabletop obstacle course. Move with W A S D or the arrows, and jump with Space.","touch":"Race across a tabletop obstacle course. Steer with the joystick and tap Jump to hop.","art":"winddash-sprint","touchArt":"winddash-sprint-touch","emphasis":["W A S D","arrows","Space","joystick","Jump"],"caption":"The chase camera follows your toy down the obstacle course.","image":"./assets/ui/tutorials/wind-up-dash-1.webp"},
    {"title":"A new course every race","text":"The road and its traps are dealt fresh each time. Look ahead: arrows, ramps and rulers show the quick way through, and a hop clears low things.","art":"winddash-deal","emphasis":["Look ahead","a hop clears low things"],"caption":"Ramps, gaps and tabletop props offer routes through the course.","image":"./assets/ui/tutorials/wind-up-dash-2.webp"},
    {"title":"Watch what moves","text":"Anything that rattles, rolls, swings or lifts runs on a rhythm. Wait for your gap, then go. First toy across the line wins.","art":"winddash-moves","emphasis":["rhythm","Wait for your gap"],"caption":"Moving traps need timing: watch the obstacle before crossing.","image":"./assets/ui/tutorials/wind-up-dash-3.webp"},
  ],
  'inferno-escape': [
    {"title":"Dig in","text":"You start in the middle of a field of blocks. Move with W A S D and press Space to break the block you are facing.","touch":"You start in the middle of a field of blocks. Push the joystick to move and turn, and tap Break to clear the block you are facing.","art":"inferno-dig","touchArt":"inferno-dig-touch","emphasis":["W A S D","Space","joystick","Break"],"caption":"Face a rock beside the central clearing to break a way out.","image":"./assets/ui/tutorials/inferno-escape-1.webp"},
    {"title":"One wall each","text":"During the 15-second preparation you may place exactly one wall with R. Use it wisely: unused walls expire.","touch":"During the 15-second preparation you may place exactly one wall with Build wall. Use it wisely: unused walls expire.","art":"inferno-wall","touchArt":"inferno-wall-touch","emphasis":["15-second","exactly one wall","with R","Build wall"],"caption":"A placed wall blocks a square and uses your one preparation wall.","image":"./assets/ui/tutorials/inferno-escape-2.webp"},
    {"title":"Outrun the furnace","text":"Then the wind-up furnace rolls out and hunts the nearest toy, chewing through blocks and walls. If it touches you, you are out. Last survivor wins.","art":"inferno-hunt","emphasis":["hunts the nearest toy","If it touches you"],"caption":"The furnace enters the cleared corridors and pursues the toys.","image":"./assets/ui/tutorials/inferno-escape-3.webp"},
  ],
  'midnight-hunger': [
    {"title":"Energy always drains","text":"Your energy bar runs down all the time. Reach zero and you are out. Last toy with energy wins.","art":"midnight-drain","emphasis":["energy bar","Reach zero"],"caption":"The energy meter and bars above the toys show remaining charge.","image":"./assets/ui/tutorials/midnight-hunger-1.webp"},
    {"title":"Hunt batteries by night","text":"At night, face a battery bot and press Space three times to claim its charge. There is always one battery too few to go round.","touch":"At night, face a battery bot and tap Hit three times to claim its charge. There is always one battery too few to go round.","art":"midnight-night","touchArt":"midnight-night-touch","emphasis":["Space three times","Hit three times","one battery too few"],"caption":"Face a battery bot; its hit markers show progress toward three hits.","image":"./assets/ui/tutorials/midnight-hunger-2.webp"},
    {"title":"Shelter by day","text":"Daylight overheats you. Get under a green roofed shelter in a corner to slow the drain. Push rivals out of your way, or hold against a push to resist.","touch":"Daylight overheats you. Steer with the joystick to a green roofed shelter in a corner. Push rivals out of your way, or hold the stick against a push to resist.","art":"midnight-day","touchArt":"midnight-day-touch","emphasis":["green roofed shelter","resist"],"caption":"Green corner roofs offer shelter from the draining daylight.","image":"./assets/ui/tutorials/midnight-hunger-3.webp"},
  ],
  'music-box-rhythm': [
    {"title":"Pins meet the line","text":"Coloured pins ride the turning music box towards a bright line. Each colour is one lane.","art":"rhythm-pins","emphasis":["bright line","one lane"],"caption":"Coloured pins approach the judgement line in four separate lanes.","image":"./assets/ui/tutorials/music-box-rhythm-1.webp"},
    {"title":"Play on the beat","text":"Press A, S, J or K as a pin crosses the line in its lane.","touch":"Tap the matching pad as a pin crosses the line in its lane. Use both thumbs.","art":"rhythm-play","touchArt":"rhythm-play-touch","emphasis":["A, S, J or K","crosses the line","matching pad"],"caption":"Hit the matching lane when its pin reaches the bright line.","image":"./assets/ui/tutorials/music-box-rhythm-2.webp"},
    {"title":"Build a combo","text":"Perfect and Good hits build your combo up to ×4. A miss or a stray tap breaks it. Highest score wins. Taps feel late? Adjust the timing offset on this card.","art":"rhythm-combo","emphasis":["×4","breaks it","timing offset"],"caption":"The combo and multiplier reward a streak of accurate lane hits.","image":"./assets/ui/tutorials/music-box-rhythm-3.webp"},
  ],
  'blink-duel': [
    {"title":"One hit and you are out","text":"Swords knock a toy out in a single hit. Last toy standing wins.","art":"blink-hit","emphasis":["single hit","Last toy standing"],"caption":"The sword arena shows the remaining contenders.","image":"./assets/ui/tutorials/blink-duel-1.webp"},
    {"title":"Blink to dodge","text":"Space blinks you forward instantly, with no cooldown. Aim with W A S D or the mouse.","touch":"Tap Blink to teleport forward instantly, with no cooldown. Steer to aim, or tap the arena.","art":"blink-dodge","touchArt":"blink-dodge-touch","emphasis":["Space","no cooldown","Blink","Steer to aim"],"caption":"A blink leaves a trail as your toy instantly crosses the arena.","image":"./assets/ui/tutorials/blink-duel-2.webp"},
    {"title":"Read the wind-up","text":"A swing (J or click) charges for almost a second, and a striped cone shows where it will land. Blink out of cones, and blinking cancels your own swing.","touch":"Swing charges for almost a second, and a striped cone shows where it will land. Blink out of cones, and blinking cancels your own swing.","art":"blink-windup","touchArt":"blink-windup-touch","emphasis":["J or click","striped cone","cancels your own swing"],"caption":"Striped attack cones reveal where the next sword swing will land.","image":"./assets/ui/tutorials/blink-duel-3.webp"},
  ],
  'spellbox-showdown': [
    {"title":"Pick your build","text":"Take your time: pick one spell per button. R offers Blink: zip ahead and shove nearby toys away. Lock your build; the fight starts three seconds after everyone has locked in.","art":"spellbox-draft","emphasis":["one spell per button","Lock your build"],"caption":"Choose a spell for each of the three slots before locking in.","image":"./assets/ui/tutorials/spellbox-showdown-1.webp"},
    {"title":"Push them out","text":"Hits add damage, and the more damage a toy has, the further it flies. Cast with Q, E and R; aim with the mouse.","touch":"Hits add damage, and the more damage a toy has, the further it flies. Tap your three spell buttons; tap the arena to aim.","art":"spellbox-push","touchArt":"spellbox-push-touch","emphasis":["more damage","Q, E and R","three spell buttons"],"caption":"A spell hit raises damage and knocks a rival toward the edge.","image":"./assets/ui/tutorials/spellbox-showdown-2.webp"},
    {"title":"Stay in the ring","text":"Cross the edge and you are out. The ring shrinks as toys fall, with a warning first. Last toy inside wins.","art":"spellbox-ring","emphasis":["Cross the edge","ring shrinks","warning"],"caption":"The shrinking-ring warning shows the next arena boundary.","image":"./assets/ui/tutorials/spellbox-showdown-3.webp"},
  ],
  'toy-squad': [
    {"title":"Buy and sell toys","text":"Spend coins on toys from the shop. Rerolling shows new offers. Drag a toy onto the shop, or select it and press Sell, to sell it. Card colours show rarity.","touch":"Spend coins on toys from the shop. Rerolling shows new offers. Drag a toy onto the shop, or tap it and tap Sell, to sell it. Card colours show rarity.","art":"toysquad-shop","emphasis":["coins","Rerolling","Sell"],"caption":"The shop offers toys, prices and a reroll button beneath your board.","image":"./assets/ui/tutorials/toy-squad-1.webp"},
    {"title":"Merge for stars","text":"Matching toys merge automatically, up to three stars. Shop cards show the copies you own. Open the Toy Handbook to browse every toy and star your favourites.","art":"toysquad-merge","emphasis":["merge automatically","three stars","Toy Handbook"],"caption":"Buying a matching copy upgrades an owned toy and adds a star.","image":"./assets/ui/tutorials/toy-squad-2.webp"},
    {"title":"Set your formation","text":"Drag toys onto the board or keep them in reserve. Toys sharing a trait symbol earn bonuses, listed at the side. Then press Ready and your squad battles on its own.","touch":"Drag toys onto the board or keep them in reserve. Toys sharing a trait symbol earn bonuses, listed at the side. Then tap Ready and your squad battles on its own.","art":"toysquad-formation","emphasis":["Drag toys","trait symbol","Ready"],"caption":"Deployed toys share the board; trait badges explain team bonuses.","image":"./assets/ui/tutorials/toy-squad-3.webp"},
    {"title":"Ten rounds","text":"A win scores 3 points and a draw 1. Most points after ten rounds wins; the players at the side show the standings (tap one to see their board). Pick passive bonuses on rounds 3, 6 and 9.","art":"toysquad-rounds","emphasis":["ten rounds","3, 6 and 9","passive bonuses"],"caption":"On a passive round, choose one of three bonuses for your squad.","image":"./assets/ui/tutorials/toy-squad-4.webp"},
  ],
  'odd-page-out': [
    {"title":"Two pages, nearly the same","text":"The book shows one picture on each page. Fifteen things on the second page are different: a colour, a pattern, something missing, turned or moved.","art":"spotdiff-pages","emphasis":["Fifteen things","second page"],"caption":"Compare the two pictures in the open storybook.","image":"./assets/ui/tutorials/odd-page-out-1.webp"},
    {"title":"Circle them","text":"Click a difference on either page to circle it. Or move the ring with the arrows and press Enter.","touch":"Tap a difference on either page to circle it.","art":"spotdiff-circle","touchArt":"spotdiff-circle-touch","emphasis":["either page","arrows","Enter","Tap a difference"],"caption":"A correct find is circled in the matching spot on both pages.","image":"./assets/ui/tutorials/odd-page-out-2.webp"},
    {"title":"Careful, quick","text":"Each find scores 10. A wrong tap holds you up for a second. Find all fifteen for a bonus: the first to finish gets the biggest.","art":"spotdiff-score","emphasis":["10","wrong tap","bonus"],"caption":"Found differences gain green circles and increase your score.","image":"./assets/ui/tutorials/odd-page-out-3.webp"},
    {"title":"Four pages","text":"Each page lasts 30 seconds, and every page is a new scene. Most points after four pages wins.","art":"spotdiff-four","emphasis":["30 seconds","four pages"],"caption":"The page counter and timer track the four-picture match.","image":"./assets/ui/tutorials/odd-page-out-4.webp"},
  ],
  'toy-tower-tumble': [
    {"title":"Build random towers","text":"Enemies walk the path on your 8×8 board. Build (B) pays 20 gold for a random tower on a felt square. Click a square first to choose where. Scroll to zoom.","touch":"Enemies walk the path on your 8×8 board. Tap a felt square, then Build here: 20 gold for a random tower. Drag to look around; pinch to zoom.","art":"towertumble-build","touchArt":"towertumble-build-touch","emphasis":["Build (B)","20 gold","Build here"],"caption":"Build a random tower on a green felt square beside the enemy path.","image":"./assets/ui/tutorials/toy-tower-tumble-1.webp"},
    {"title":"Merge by tier","text":"Any two same-tier towers merge into a random tower one tier up, to tier 7. Press M to merge a pair automatically, or drag one onto a glowing partner and choose Merge (M) or Swap (S).","touch":"Any two towers of the same tier merge into a random tower one tier up, to tier 7. Drag one onto a glowing same-tier tower (or tap one, then the other), then press Merge where it will land.","art":"towertumble-merge","touchArt":"towertumble-merge-touch","emphasis":["same-tier","M","tier 7"],"caption":"Same-tier towers glow as merge partners, even when their types differ.","image":"./assets/ui/tutorials/toy-tower-tumble-2.webp"},
    {"title":"Odds, quests and bosses","text":"Level your builder for better odds. Quick quests pay gold, and some a free tower too. Bosses on waves 5, 10, 15 and 20 drop free high-tier towers.","art":"towertumble-odds","emphasis":["Level your builder","Quick quests","5, 10, 15 and 20"],"caption":"Builder upgrades improve odds; the quest list shows gold rewards.","image":"./assets/ui/tutorials/toy-tower-tumble-3.webp"},
    {"title":"Hold the line","text":"Leaks cost lives; at zero you are out and can watch the other boards (tap a player). Survive the most waves, or clear all 20, to win, then try the damage check.","art":"towertumble-hold","emphasis":["Leaks cost lives","at zero","most waves"],"caption":"Towers fire at enemies following the path; leaks reduce your lives.","image":"./assets/ui/tutorials/toy-tower-tumble-4.webp"},
  ],
  'hoop-hustle': [
    {"title":"Shoot from your spot","text":"Everyone shoots at one hoop from their own spot on the taped arc. Near spots score 1, middle 2, far 3. Sink one and you hop to a new spot.","art":"hoophustle-spots","emphasis":["1","2","3","hop to a new spot"],"caption":"Toys on their spots around the arc, each spot marked with one, two or three dots.","image":"./assets/ui/tutorials/hoop-hustle-1.webp"},
    {"title":"Hold, then let go","text":"Hold Space, E or the mouse button to charge; let go to throw. Let go in the meter’s gold zone and the arc turns gold: it goes in. A / D or the mouse aims.","touch":"Hold the Throw button to charge; let go to shoot. Let go in the meter’s gold zone and the arc turns gold: it goes in. The joystick aims.","art":"hoophustle-throw","touchArt":"hoophustle-throw-touch","emphasis":["Hold Space, E or the mouse button","let go","gold zone","the arc turns gold","Hold the Throw button","let go to shoot"],"caption":"A charged throw: the arc preview glows gold when it will score.","image":"./assets/ui/tutorials/hoop-hustle-2.webp"},
    {"title":"Sliding hoop, gold balls","text":"At half time the hoop slides on its wind-up track: shoot while it rests at an end. In the last 15 seconds your next ball is gold and scores double. Most points wins.","art":"hoophustle-twists","emphasis":["half time","rests at an end","gold","scores double","Most points wins"],"caption":"The hoop slides on its track in the second half, and gold balls score double at the end.","image":"./assets/ui/tutorials/hoop-hustle-3.webp"},
  ],
  'toybox-siege': [
    {"title":"Pick a toy and keep moving","text":"Choose the Tin Soldier, the Pop-Gun Ranger or the Clockwork Wizard. Your weapons fire on their own: move with W A S D or the arrows to dodge the swarm.","touch":"Choose the Tin Soldier, the Pop-Gun Ranger or the Clockwork Wizard. Your weapons fire on their own: touch and drag anywhere low on the screen to dodge the swarm.","art":"siege-move","touchArt":"siege-move-touch","emphasis":["W A S D","arrows","touch and drag","fire on their own"],"caption":"The untimed class card: three toys, each with its own starting weapon.","image":"./assets/ui/tutorials/toybox-siege-1.webp"},
    {"title":"Grab gems, level up","text":"Defeated toys drop gems. Collect them to level up and pick a card. Each shows its level change (Lv 4 → 5), and a star badge marks a secret upgrade.","art":"siege-level","emphasis":["gems","pick a card","secret upgrade"],"caption":"A level-up card: every option shows its icon, its level change and any secret-upgrade badge.","image":"./assets/ui/tutorials/toybox-siege-2.webp"},
    {"title":"Elites, treasure and rivals","text":"An elite arrives every minute and drops a chest: a maxed weapon plus its partner passive evolves, as does a maxed Rally Horn. Skip a chest to send an elite to a rival. Fall? Pay to revive once.","art":"siege-elite","emphasis":["every minute","evolves","send an elite","revive once"],"caption":"The Rag Bear arrives at 1:00 while corks, chimes, yo-yos and marbles clear the swarm.","image":"./assets/ui/tutorials/toybox-siege-3.webp"},
    {"title":"The boss, then the arena","text":"Beat the Boiler Baron at 4:00 for three chests and 15 s to upgrade. At 5:00 every toy left meets in the arena: last one standing wins. The Rally Horn calls a Baron for you.","art":"siege-boss","emphasis":["three chests","the arena","last one standing wins"],"caption":"The final arena: every build fights at once, and a summoned Baron fights for its owner.","image":"./assets/ui/tutorials/toybox-siege-4.webp"},
  ],
  'hoop-clash': [
    {"title":"Red against Blue","text":"Two teams in jerseys, two or four a side, with bots filling the gaps. A jump ball starts it: snatch the ball as it falls. Score more baskets than the other team.","art":"hoopclash-teams","emphasis":["Two teams in jerseys","jump ball","snatch the ball"],"caption":"The jump ball: Red and Blue toys in jerseys at the centre circle, the ball up for grabs.","image":"./assets/ui/tutorials/hoop-clash-1.webp"},
    {"title":"Hold, then let go","text":"Hold E, Space or the mouse to charge; let go to shoot. When the arc turns gold, it goes in. Inside the arc scores 2, beyond it 3.","touch":"Hold Shoot to charge; let go to shoot. When the arc turns gold, it goes in. Inside the arc scores 2, beyond it 3.","art":"hoopclash-shoot","touchArt":"hoopclash-shoot-touch","emphasis":["Hold E, Space or the mouse","Hold Shoot","let go","arc turns gold","2","3"],"caption":"A charged shot: the arc preview glows gold when it will drop.","image":"./assets/ui/tutorials/hoop-clash-2.webp"},
    {"title":"Pass and steal","text":"Q or right click passes to the teammate you face. Without the ball, E swipes: steal it off a dribbler, or snatch a pass or a shot out of the air.","touch":"Pass throws to the teammate you face. Without the ball, Steal swipes: take it off a dribbler, or snatch a pass or a shot out of the air.","art":"hoopclash-steal","touchArt":"hoopclash-steal-touch","emphasis":["Q or right click","Pass","E swipes","Steal swipes","off a dribbler","out of the air"],"caption":"A swipe at a Blue dribbler takes the ball away.","image":"./assets/ui/tutorials/hoop-clash-3.webp"},
    {"title":"Clocks and halves","text":"Shoot before the 14-second shot clock runs out. After a basket the other team inbounds. Two halves, switching ends; a tie goes to overtime: next basket wins.","art":"hoopclash-clocks","emphasis":["14-second shot clock","other team inbounds","switching ends","next basket wins"],"caption":"Halftime on the scoreboard: the teams switch ends.","image":"./assets/ui/tutorials/hoop-clash-4.webp"},
  ],
};

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
