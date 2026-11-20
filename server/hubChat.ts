/**
 * One Hub room's text chat and its Who Am I? cards (the suspicious box). Owned by HubRoom, which
 * passes in the roster and turns player ids into connections.
 *
 * Pure and deterministic like the room: time and randomness are passed in. Every method returns
 * messages addressed to player ids. Messages are built per recipient where they differ:
 * - a card's word goes to everyone in the room except its holder (until it is guessed or peeled);
 * - a chat line that contains a holder's answer reaches that holder masked ("p******").
 * Unit-tested in tests/unit/hub-chat.test.ts.
 */
import { CHAT_BURST, CHAT_REFILL_MS, cleanChatText, filterChat } from '../src/net/chatFilter';
import { CARD_COOLDOWN_MS, CARD_RECENT, JACK_DEAL_REACH, JACK_SPOT, WHO_CARDS, articleFor, dealIndex, isCorrectGuess, maskAnswers } from '../src/game/whoAmI';
import { CHAT_NOTE_TEXT, type CardEventMsg, type ChatNoteCode, type ServerMsg } from '../src/net/protocol';
import { RateLimiter } from './limits';

/** What the room tells the chat about a player. */
export interface ChatPlayer {
  id: string;
  name: string;
  /** Connected right now (only connected players are sent anything). */
  connected: boolean;
  /** In a trial, the Workshop or the shop (null: walking the Hub). */
  away: boolean;
  x: number;
  z: number;
}

export type ChatOut = { kind: 'send'; to: string[]; msg: ServerMsg };

interface Card {
  index: number;
  since: number;
}

export class HubChat {
  private seq = 0;
  private readonly limits = new Map<string, RateLimiter>();
  private readonly cards = new Map<string, Card>();
  private readonly lastDeal = new Map<string, number>();
  private readonly recent = new Map<string, number[]>();

  constructor(
    private readonly random: () => number,
    /** Everyone in the room, connected or held. */
    private readonly roster: () => Iterable<ChatPlayer>,
  ) {}

  /** The card index a player wears (tests), or null. */
  cardOf(id: string): number | null {
    return this.cards.get(id)?.index ?? null;
  }
  get cardCount() {
    return this.cards.size;
  }

  // ------------------------------------------------------------ chat
  /** A chat message from `p`: cleaned, rate-limited, checked as a guess, filtered, masked per recipient. */
  say(p: ChatPlayer, raw: string, now: number): ChatOut[] {
    const text = cleanChatText(raw);
    if (!text) return [];
    let lim = this.limits.get(p.id);
    if (!lim) this.limits.set(p.id, (lim = new RateLimiter(CHAT_BURST, 1000 / CHAT_REFILL_MS, now)));
    if (!lim.take(now)) return [this.note(p.id, 'slow', CHAT_REFILL_MS)];

    const mine = this.cards.get(p.id);
    if (mine && isCorrectGuess(WHO_CARDS[mine.index], text)) return this.takeOff(p, 'solved');

    const shown = filterChat(text);
    const n = ++this.seq;
    const out: ChatOut[] = [];
    const plain: string[] = [];
    for (const q of this.roster()) {
      if (!q.connected) continue;
      const card = q.id !== p.id ? this.cards.get(q.id) : undefined;
      const masked = card ? maskAnswers(shown, WHO_CARDS[card.index]) : shown;
      if (masked === shown) plain.push(q.id);
      else out.push({ kind: 'send', to: [q.id], msg: { t: 'chat', id: p.id, name: p.name, text: masked, n, m: 1 } });
    }
    if (plain.length) out.unshift({ kind: 'send', to: plain, msg: { t: 'chat', id: p.id, name: p.name, text: shown, n } });
    return out;
  }

  // ------------------------------------------------------------ Who Am I? cards
  /** `p` opened the box: deal them a card (checked: in the Hub, by the box, none on, not too soon). */
  deal(p: ChatPlayer, now: number): ChatOut[] {
    if (p.away) return [this.note(p.id, 'card_away')];
    if (this.cards.has(p.id)) return [this.note(p.id, 'card_busy')];
    if (Math.hypot(p.x - JACK_SPOT.x, p.z - JACK_SPOT.z) > JACK_DEAL_REACH) return [this.note(p.id, 'card_far')];
    if (now - (this.lastDeal.get(p.id) ?? -Infinity) < CARD_COOLDOWN_MS) return [this.note(p.id, 'card_wait')];
    const recent = this.recent.get(p.id) ?? [];
    const inPlay = [...this.cards.values()].map((c) => c.index);
    const index = dealIndex(this.random, [...inPlay, ...recent]);
    this.cards.set(p.id, { index, since: now });
    this.lastDeal.set(p.id, now);
    this.recent.set(p.id, [...recent, index].slice(-CARD_RECENT));
    const card = WHO_CARDS[index];
    const out: ChatOut[] = [];
    const others: string[] = [];
    for (const q of this.roster()) if (q.connected && q.id !== p.id) others.push(q.id);
    if (p.connected) out.push({ kind: 'send', to: [p.id], msg: { t: 'card', k: 'on', id: p.id, name: p.name } });
    if (others.length) out.push({ kind: 'send', to: others, msg: { t: 'card', k: 'on', id: p.id, name: p.name, w: card.name } });
    return out;
  }

  /** `p` gives up: the card comes off and its word is shown to everyone, `p` included. */
  peel(p: ChatPlayer): ChatOut[] {
    if (!this.cards.has(p.id)) return [this.note(p.id, 'card_none')];
    return this.takeOff(p, 'peeled');
  }

  /** `p` left the Hub floor (a trial, the Workshop, the shop) or lost their connection: the card falls off unrevealed. */
  drop(p: ChatPlayer): ChatOut[] {
    if (!this.cards.has(p.id)) return [];
    return this.takeOff(p, 'off');
  }

  /** `id` is gone from the room for good. */
  forget(id: string, name: string): ChatOut[] {
    const out = this.cards.has(id) ? this.takeOff({ id, name }, 'off') : [];
    this.limits.delete(id);
    this.lastDeal.delete(id);
    this.recent.delete(id);
    return out;
  }

  /** Who wears a card, as `viewer` may see it (their own card without its word). */
  view(viewer: string): ServerMsg {
    const c = [...this.cards].map(([id, card]) => (id === viewer ? { id } : { id, w: WHO_CARDS[card.index].name }));
    return { t: 'cards', c };
  }

  clear() {
    this.cards.clear();
    this.limits.clear();
    this.lastDeal.clear();
    this.recent.clear();
  }

  private takeOff(p: Pick<ChatPlayer, 'id' | 'name'>, k: 'solved' | 'peeled' | 'off'): ChatOut[] {
    const c = this.cards.get(p.id);
    if (!c) return [];
    this.cards.delete(p.id);
    const card = WHO_CARDS[c.index];
    const to: string[] = [];
    for (const q of this.roster()) if (q.connected && (k !== 'off' || q.id !== p.id)) to.push(q.id);
    const msg: CardEventMsg = { t: 'card', k, id: p.id, name: p.name, w: card.name, ar: articleFor(card) };
    const out: ChatOut[] = [];
    if (to.length) out.push({ kind: 'send', to, msg });
    // A card that just fell off isn't revealed to its holder.
    if (k === 'off' && this.isConnected(p.id)) out.push({ kind: 'send', to: [p.id], msg: { t: 'card', k, id: p.id, name: p.name } });
    return out;
  }

  private isConnected(id: string) {
    for (const q of this.roster()) if (q.id === id) return q.connected;
    return false;
  }

  private note(id: string, code: ChatNoteCode, wait?: number): ChatOut {
    return { kind: 'send', to: [id], msg: { t: 'chatNote', code, message: CHAT_NOTE_TEXT[code], ...(wait !== undefined ? { wait } : {}) } };
  }
}
