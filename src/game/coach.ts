/**
 * First-time menu tips ("coach marks"): the first time a player opens one of the game's menus, a
 * short run of steps points at its parts, one at a time, with a speech card from Pipwick.
 *
 * This module is the pure side (no DOM, no React; unit tested): the tours and their words, which
 * step comes next when some parts of a menu aren't showing, whether a tour should run, the saved
 * "seen" list, and where to put the card so it never covers what it points at. The DOM side is
 * src/ui/CoachMarks.tsx; each menu marks its parts with `data-coach="<target>"`.
 *
 * The tours follow the player's "Game tutorials" setting: with it off, none of them show.
 */
import { FORMATS } from '../minigames/tournament';
import { POINTS_TABLE } from '../minigames/scoring';
import { FEATURED_DISCOUNT } from './economy';

export type CoachTourId = 'menu' | 'pavilion' | 'trial' | 'workshop' | 'shop' | 'scoreboard' | 'jukebox' | 'lobby';

export interface CoachStep {
  /** The `data-coach` value of the element this step points at. */
  target: string;
  title: string;
  text: string;
  /** Different words on a touch screen (e.g. "tap" instead of a key). */
  touch?: string;
}

const f = FORMATS;
const pts = POINTS_TABLE;

/** Every tour, in the order its steps show. Steps whose element isn't on screen are passed over. */
export const COACH_TOURS: Record<CoachTourId, readonly CoachStep[]> = {
  menu: [
    {
      target: 'menu-play',
      title: 'Play',
      text: 'Play takes your toy into the Playroom Hub. Every trial, the Tournament Pavilion and the shops are in there.',
    },
    {
      target: 'menu-workshop',
      title: 'Workshop',
      text: 'Give your toy a name, a paint job, a hat, a wind-up key and gestures.',
    },
    {
      target: 'menu-online',
      title: 'Shop and online',
      text: 'Shop spends the cogs you earn on new looks. Play online puts you in a shared Hub with other players.',
    },
    {
      target: 'menu-small',
      title: 'Settings and help',
      text: 'Settings has the volumes, graphics and tutorials. How to play shows the controls and Pipwick’s tour of the Hub.',
    },
  ],
  pavilion: [
    {
      target: 'pavilion-tabs',
      title: 'Practice or online',
      text: 'Practise with bots plays here, on your own, any time. Host an online lobby opens a game everyone in the online Hub can join.',
    },
    {
      target: 'pavilion-formats',
      title: 'Pick a format',
      text: `A tournament is a run of trials dealt for you. ${f.blitz.name} is ${f.blitz.games} quick party trials. ${f.normal.name} (${f.normal.games}) and ${f.treasure.name} (${f.treasure.games}) end with a longer strategy finale.`,
    },
    {
      target: 'pavilion-online',
      title: 'Host a lobby',
      text: 'Set the player cap and bot fill, then host. Lobbies already open in this Hub are listed underneath to join.',
    },
    {
      target: 'pavilion-rule',
      title: 'How points work',
      text: `Every trial pays points by place: ${pts[0]} for 1st, ${pts[1]} for 2nd, ${pts[2]} for 3rd and so on. Most points after the last trial wins.`,
    },
    {
      target: 'pavilion-bots',
      title: 'Opponents',
      text: 'Choose how many bot toys you face and how good they are.',
    },
    {
      target: 'pavilion-practice',
      title: 'Just one trial',
      text: 'Open a section and pick any trial to practise it on its own. Every trial also has its own gate in the Hub, over the domino bridge.',
    },
    {
      target: 'pavilion-start',
      title: 'Ready?',
      text: 'Start tournament deals the trials and begins. Not now closes the Pavilion.',
    },
  ],
  trial: [
    {
      target: 'trial-howto',
      title: 'How to play',
      text: 'The rules and controls, in pictures. Page through with its Next button; the How to play button brings it back later.',
    },
    {
      target: 'trial-opponents',
      title: 'Opponents',
      text: 'Play solo or add bots to beat. With bots, Bot skill sets how sharp they are.',
    },
    {
      target: 'trial-host',
      title: 'Online lobby',
      text: 'Once you’ve joined the online Hub, you can host this trial here for other players.',
    },
    {
      target: 'trial-start',
      title: 'Off you go',
      text: 'Start begins the trial (in a tournament it says Ready!). The other button leaves.',
    },
  ],
  workshop: [
    {
      target: 'workshop-tabs',
      title: 'What to change',
      text: 'Paint, hats, keys, accessories and gestures each have a tab.',
    },
    {
      target: 'workshop-items',
      title: 'Try things on',
      text: 'Pick an item to wear it. A padlock means locked: pick it to see how to earn it. Drag the toy to spin it.',
      touch: 'Tap an item to wear it. A padlock means locked: tap it to see how to earn it. Drag the toy to spin it.',
    },
    {
      target: 'workshop-name',
      title: 'Your name',
      text: 'Other players see this name in trials and online.',
    },
    {
      target: 'workshop-actions',
      title: 'More looks',
      text: 'The Shop sells more for cogs. Your look is saved as you go; Done takes you back.',
    },
  ],
  shop: [
    {
      target: 'shop-wallet',
      title: 'Your cogs',
      text: 'Earn cogs by finishing trials, winning, finding the Playroom’s secrets and finishing tournaments.',
    },
    {
      target: 'shop-featured',
      title: 'Today’s picks',
      text: `These are ${Math.round(FEATURED_DISCOUNT * 100)}% off today. A new set comes in at midnight.`,
    },
    {
      target: 'shop-tabs',
      title: 'Browse',
      text: 'Each tab is one kind of item. Pick any card to try it on your toy before you buy.',
      touch: 'Each tab is one kind of item. Tap any card to try it on your toy before you buy.',
    },
    {
      target: 'shop-detail',
      title: 'Buy and wear',
      text: 'The item you picked shows here with Buy, then Equip. Gestures go in four slots, played with keys 1 to 4 or the Emote button.',
    },
  ],
  scoreboard: [
    {
      target: 'scoreboard-online',
      title: 'Online leaderboard',
      text: 'The best players in online lobby tournaments, one board per format.',
    },
    {
      target: 'scoreboard-records',
      title: 'Your records',
      text: 'Secrets you’ve found, your best in each trial and your tournament wins, kept on this device.',
    },
  ],
  jukebox: [
    {
      target: 'jukebox-tracks',
      title: 'Pick a tune',
      text: 'Pick a track to play it around the Hub. Quiet, please turns the Hub music off; the trials keep their own.',
    },
    {
      target: 'jukebox-note',
      title: 'Never the same',
      text: 'The jukebox composes each track as it plays. Music volume is in Settings.',
    },
  ],
  lobby: [
    {
      target: 'lobby-members',
      title: 'Who’s in',
      text: 'Everyone in this lobby. Ready shows who is set to play; the host can kick players.',
    },
    {
      target: 'lobby-settings',
      title: 'The settings',
      text: 'One trial or a tournament, how many can join, open or locked, and bots for empty seats. Only the host changes them.',
    },
    {
      target: 'lobby-actions',
      title: 'Ready up',
      text: 'The host presses Start when everyone is in; everyone else presses I’m ready. Leave lobby takes you back to the Hub.',
    },
  ],
};

export const COACH_TOUR_IDS = Object.keys(COACH_TOURS) as CoachTourId[];

export const isCoachTourId = (v: unknown): v is CoachTourId => typeof v === 'string' && (COACH_TOUR_IDS as string[]).includes(v);

/** The words for a step on this device. */
export const stepText = (s: CoachStep, touch: boolean) => (touch && s.touch) || s.text;

// ------------------------------------------------------------------ steps and seen-state

/**
 * The step to show after `from` going `dir` (+1 next, -1 back), passing over steps whose element
 * isn't on screen (`present(target)` false). `from` -1 with dir +1 finds the first. -1 if none.
 */
export function stepFrom(steps: readonly CoachStep[], from: number, dir: 1 | -1, present: (target: string) => boolean): number {
  for (let i = from + dir; i >= 0 && i < steps.length; i += dir) if (present(steps[i].target)) return i;
  return -1;
}

/** "2 / 5": where `index` sits among the steps that are on screen now. */
export function stepCount(steps: readonly CoachStep[], index: number, present: (target: string) => boolean): { n: number; of: number } {
  let n = 0;
  let of = 0;
  steps.forEach((s, i) => {
    if (i === index || present(s.target)) {
      of++;
      if (i <= index) n++;
    }
  });
  return { n, of };
}

/** Whether a tour should start: tutorials on, not seen yet, and nothing else holding the screen. */
export function shouldCoach(s: { tutorials: boolean; coachSeen: readonly string[] }, id: CoachTourId, held = false): boolean {
  return s.tutorials && !held && !s.coachSeen.includes(id);
}

/** A copy of the seen list with `id` added (once). */
export function withSeen(seen: readonly CoachTourId[], id: CoachTourId): CoachTourId[] {
  return seen.includes(id) ? seen.slice() : [...seen, id];
}

/** A saved seen list, whatever was stored: known tour ids only, once each. */
export function cleanCoachSeen(v: unknown): CoachTourId[] {
  if (!Array.isArray(v)) return [];
  return COACH_TOUR_IDS.filter((id) => v.includes(id));
}

// ------------------------------------------------------------------ placing the card

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type CoachSide = 'below' | 'above' | 'right' | 'left' | 'center' | 'overlap';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Area shared by two rectangles (0 if they don't touch). */
export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** The part of `a` inside `b`, or null. */
export function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/**
 * Where the card goes: beside the target (below, then above, then right, then left), inside
 * `view` (the screen less its safe-area insets and a margin), never covering the target when any
 * side has room. Without room on any side it hugs the top or bottom edge, whichever covers less
 * of the target (side 'overlap'); the caller first scrolls the target to make room where it can.
 * No target: centred.
 */
export function placeCard(view: Rect, target: Rect | null, card: { w: number; h: number }, gap = 12): { x: number; y: number; side: CoachSide } {
  const w = Math.min(card.w, view.w);
  const h = Math.min(card.h, view.h);
  const right = view.x + view.w - w;
  const bottom = view.y + view.h - h;
  if (!target) return { x: view.x + (view.w - w) / 2, y: view.y + (view.h - h) / 2, side: 'center' };
  const cx = clamp(target.x + target.w / 2 - w / 2, view.x, right);
  const cy = clamp(target.y + target.h / 2 - h / 2, view.y, bottom);
  const below = target.y + target.h + gap;
  if (below <= bottom) return { x: cx, y: below, side: 'below' };
  const above = target.y - gap - h;
  if (above >= view.y) return { x: cx, y: above, side: 'above' };
  const toRight = target.x + target.w + gap;
  if (toRight <= right) return { x: toRight, y: cy, side: 'right' };
  const toLeft = target.x - gap - w;
  if (toLeft >= view.x) return { x: toLeft, y: cy, side: 'left' };
  const top = { x: cx, y: view.y, w, h };
  const low = { x: cx, y: bottom, w, h };
  const pick = overlapArea(low, target) <= overlapArea(top, target) ? low : top;
  return { x: pick.x, y: pick.y, side: 'overlap' };
}

/**
 * How far to scroll (positive = content moves up) so a target of height `targetH`, now at
 * `targetY`, leaves room for a card of height `cardH` below it (or above it when `above`) inside
 * `view`. 0 if it already fits or can't fit at all.
 */
export function roomScroll(view: Rect, targetY: number, targetH: number, cardH: number, gap: number, above = false): number {
  if (targetH + cardH + gap * 2 > view.h) return 0;
  const want = above ? view.y + gap + cardH + gap : view.y + gap;
  return targetY - want;
}
