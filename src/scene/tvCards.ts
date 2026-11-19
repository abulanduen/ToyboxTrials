/**
 * What the little retro TV beside the Scoreboard shows: a few "channels" it cycles through.
 * Pure: the TV (HubTV.tsx) gathers the inputs from the net store, the remote players' plain
 * objects and the game store, and draws whatever card this returns. Unit tested.
 */
import { PALETTE } from '../game/palette';
import type { MinigameId } from '../minigames/types';
import { MINIGAMES } from '../minigames/registry';
import type { Activity } from '../net/protocol';
import { gateFor } from './layout';

export const TV_CARDS = ['online', 'friends', 'shop', 'records'] as const;
export type TvCardId = (typeof TV_CARDS)[number];
/** Seconds each card stays up before the TV flips to the next. */
export const TV_CARD_SECONDS = 6;
/** Characters per body line on the screen (the canvas is 160 px wide, 6 px per character). */
export const TV_COLS = 25;
/** Body lines that fit under the title bar. */
export const TV_ROWS = 9;

export interface TvLine {
  text: string;
  color?: string;
}
export interface TvCard {
  id: TvCardId;
  title: string;
  /** Title bar colour. */
  accent: string;
  lines: TvLine[];
  /** A colour swatch to draw (the shop's featured item). */
  swatch?: string;
}

export interface TvPlayer {
  id: string;
  name: string;
  activity: Activity | null;
}
export interface TvFeatured {
  name: string;
  blurb: string;
  swatch: string;
  /** e.g. 'Hat' or 'Wind-up key'. */
  kind: string;
}
export interface TvInputs {
  status: 'offline' | 'connecting' | 'online' | 'reconnecting';
  room: { kind: 'public' | 'private'; code: string | null; instance: number | null } | null;
  selfId: string | null;
  /** Everyone in the room (including this player), with what they are doing. */
  players: TvPlayer[];
  records: Partial<Record<MinigameId, { best: number; plays: number; wins: number }>>;
  tournamentWins: number;
  secrets: number;
  secretTotal: number;
  /** Items the shop can feature (read from the cosmetics catalogue); one is picked per cycle. */
  featured: TvFeatured[];
}

const short = (game: MinigameId) => gateFor(game)?.short ?? MINIGAMES.find((g) => g.id === game)?.title ?? game;
export const activityLabel = (a: Activity) => (a === 'workshop' ? 'Workshop' : short(a));
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}.` : s);

/** Which card is showing `t` seconds in, with `skip` manual channel changes. */
export function tvChannel(t: number, skip = 0) {
  const cycle = Math.floor(t / TV_CARD_SECONDS) + skip;
  return { index: ((cycle % TV_CARDS.length) + TV_CARDS.length) % TV_CARDS.length, cycle };
}

export function tvCard(id: TvCardId, inp: TvInputs, cycle = 0): TvCard {
  const online = inp.status === 'online';
  const P = PALETTE;
  switch (id) {
    case 'online': {
      if (!online) {
        const busy = inp.status === 'connecting' || inp.status === 'reconnecting';
        return {
          id,
          title: 'ONLINE NOW',
          accent: P.toyBlue,
          lines: busy
            ? [{ text: 'CONNECTING...' }, { text: '' }, { text: 'HOLD ON TO YOUR KEY!', color: P.honey }]
            : [{ text: 'NOBODY HERE BUT US TOYS.' }, { text: '' }, { text: 'PLAY ONLINE FROM', color: P.honey }, { text: 'THE MENU TO MEET', color: P.honey }, { text: 'OTHER WIND-UPS!', color: P.honey }],
        };
      }
      const room = inp.room?.kind === 'private' ? `PRIVATE ROOM ${inp.room.code ?? ''}` : `PUBLIC HUB #${inp.room?.instance ?? 1}`;
      const lines: TvLine[] = [{ text: room, color: P.honey }, { text: `${inp.players.length} TOY${inp.players.length === 1 ? '' : 'S'} HERE` }];
      const shown = inp.players.slice(0, TV_ROWS - 3);
      for (const p of shown) {
        const tag = p.id === inp.selfId ? ' (YOU)' : p.activity ? ` > ${activityLabel(p.activity)}` : '';
        lines.push({ text: clip(`${clip(p.name, 12)}${tag}`, TV_COLS), color: p.id === inp.selfId ? P.sage : undefined });
      }
      if (inp.players.length > shown.length) lines.push({ text: `+${inp.players.length - shown.length} MORE` });
      return { id, title: 'ONLINE NOW', accent: P.toyBlue, lines };
    }
    case 'friends': {
      if (!online) return { id, title: 'NOW PLAYING', accent: P.coral, lines: [{ text: 'GO ONLINE TO SEE WHO' }, { text: 'IS IN WHICH TRIAL.' }] };
      const busy = inp.players.filter((p) => p.id !== inp.selfId && p.activity && p.activity !== 'workshop');
      if (!busy.length) return { id, title: 'NOW PLAYING', accent: P.coral, lines: [{ text: 'NO ONE IS IN A TRIAL' }, { text: 'RIGHT NOW.' }, { text: '' }, { text: 'THE GATES ARE OVER', color: P.honey }, { text: 'THE DOMINO BRIDGE!', color: P.honey }] };
      const lines: TvLine[] = busy.slice(0, TV_ROWS - 1).map((p) => ({ text: clip(`${clip(p.name, 11)} > ${activityLabel(p.activity!)}`, TV_COLS) }));
      if (busy.length > TV_ROWS - 1) lines.push({ text: `+${busy.length - (TV_ROWS - 1)} MORE` });
      return { id, title: 'NOW PLAYING', accent: P.coral, lines };
    }
    case 'shop': {
      const item = inp.featured.length ? inp.featured[((cycle % inp.featured.length) + inp.featured.length) % inp.featured.length] : null;
      if (!item) return { id, title: 'ODDS & ENDS', accent: P.sage, lines: [{ text: 'BACK SOON!' }] };
      return {
        id,
        title: 'ODDS & ENDS',
        accent: P.sage,
        swatch: item.swatch,
        lines: [{ text: 'FEATURED:', color: P.honey }, { text: clip(item.name, TV_COLS - 6) }, { text: item.kind.toUpperCase() }, { text: '' }, { text: '' }, { text: 'AT THE SHOP BY THE', color: P.honey }, { text: 'WORKSHOP.', color: P.honey }],
      };
    }
    case 'records': {
      const rows = (Object.entries(inp.records) as [MinigameId, { best: number; plays: number; wins: number }][])
        .filter(([, r]) => r && r.plays > 0)
        .sort((a, b) => b[1].plays - a[1].plays || a[0].localeCompare(b[0]))
        .slice(0, 5);
      const lines: TvLine[] = rows.length
        ? rows.map(([g, r]) => ({ text: clip(`${clip(short(g), 12).padEnd(12)} *${r.best} W${r.wins}`, TV_COLS) }))
        : [{ text: 'NO RECORDS YET -' }, { text: 'TRY A TRIAL!' }];
      lines.push({ text: '' }, { text: `CUPS ${inp.tournamentWins}   SECRETS ${inp.secrets}/${inp.secretTotal}`, color: P.honey });
      return { id, title: 'YOUR RECORDS', accent: P.honey, lines };
    }
  }
}

/** A short string that changes whenever what a card shows changes (redraw only then). */
export function tvCardKey(card: TvCard) {
  return `${card.id}|${card.title}|${card.swatch ?? ''}|${card.lines.map((l) => `${l.text}~${l.color ?? ''}`).join('/')}`;
}
