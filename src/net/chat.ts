/**
 * Online Hub text chat and Who Am I? cards, browser side: the chat store (lines, open/closed,
 * muted players, who wears a card), the handlers for the server's `chat`, `chatNote`, `card` and
 * `cards` messages (wired up by client.ts), and the actions the UI calls.
 *
 * Event-driven only: React state changes when a message arrives or the player opens the chat,
 * never per frame. Speech bubbles are written straight into the name-tag elements that the
 * remote-player frame loop already positions (no per-frame React state).
 *
 * The server decides everything (names, filtering, cards, guesses); this file only shows it.
 * Sending goes through netLink (no import of client.ts, which imports this file).
 */
import { create } from 'zustand';
import { netLink } from './link';
import { useNet } from './store';
import { nameTagEls, remotes } from './remotes';
import { cleanChatText } from './chatFilter';
import type { CardEventMsg, CardsMsg, ChatLineMsg, ChatNoteMsg } from './protocol';
import { useGame } from '../game/store';
import { events } from '../game/events';
import { sfx } from '../game/audio';
import { clearInput } from '../game/input';
import { tourFlag } from '../game/tourFlag';
import { player } from '../game/player';
import { applyReward, cogText, dateKey, rewardWhoAmI } from '../game/economy';
import { withArticle } from '../game/whoAmI';
import { PALETTE } from '../game/palette';
import { fxQueue } from '../hubplay/runtime';

export interface ChatLine {
  /** Unique key in the log. */
  key: number;
  /** Speaker's player id; null for room announcements and notes. */
  id: string | null;
  name: string;
  text: string;
  kind: 'say' | 'announce' | 'note';
  /** A Who Am I? answer was masked in this copy. */
  masked?: boolean;
  /** performance.now() when it arrived. */
  at: number;
}

export interface ChatState {
  lines: ChatLine[];
  /** The chat box is open (desktop input, or the phone sheet). */
  open: boolean;
  /** Player ids whose messages (and bubbles) this player hides. Session only. */
  muted: string[];
  /** Who wears a Who Am I? card: holder id → the word, or null for your own (never sent to you). */
  cards: Record<string, string | null>;
  /** Lines that arrived while the phone sheet was closed. */
  unread: number;
  set: (patch: Partial<ChatState>) => void;
}

export const useChat = create<ChatState>()((set) => ({
  lines: [],
  open: false,
  muted: [],
  cards: {},
  unread: 0,
  set: (patch) => set(patch),
}));

/** Lines kept in the log. */
const MAX_LINES = 60;
/** How long a speech bubble stays over a toy (ms), plus a little per character. */
const BUBBLE_MS = 4500;
let lineKey = 1;
/** When our own card went on (performance.now()), for the reward's minimum wear time. */
let myCardAt = 0;
/** The pointer was locked when the chat opened: sending with Enter takes it back. */
let relockAfter = false;

const selfId = () => useNet.getState().selfId;

function addLine(line: Omit<ChatLine, 'key' | 'at'>) {
  const s = useChat.getState();
  const lines = [...s.lines, { ...line, key: lineKey++, at: performance.now() }].slice(-MAX_LINES);
  const muted = line.id !== null && s.muted.includes(line.id);
  s.set({ lines, unread: s.open || muted ? s.unread : Math.min(99, s.unread + 1) });
}

// ---------------------------------------------------------------- what the player can do
/** Chat can open: online, in the Hub, nothing else on screen, text chat switched on. */
export function canChat(): boolean {
  const g = useGame.getState();
  return useNet.getState().status === 'online' && g.textChat && g.screen === 'playing' && !g.paused && !g.panel && !tourFlag.active;
}

export function openChat() {
  if (!canChat()) return;
  const s = useChat.getState();
  if (s.open) return;
  clearInput(); // keys held when the box opened must not keep the toy walking
  s.set({ open: true, unread: 0 });
  // The flag is set first: PlayerController must not read this unlock as Esc (pause).
  relockAfter = !!document.pointerLockElement;
  if (document.pointerLockElement) document.exitPointerLock();
}

/** Close the chat box. `relock`: try to take the pointer back (a key press counts as a gesture; Esc doesn't). */
export function closeChat(relock = false) {
  const s = useChat.getState();
  if (!s.open) return;
  s.set({ open: false });
  clearInput();
  const el = document.activeElement as HTMLElement | null;
  if (el && el.tagName === 'INPUT') el.blur();
  if (relock && relockAfter && !useGame.getState().touchUI) {
    const canvas = document.querySelector('canvas');
    const p = canvas?.requestPointerLock?.() as unknown as Promise<void> | undefined;
    p?.catch?.(() => {}); // refused: the "Click the scene to look around" hint shows, and a click locks it
  }
  relockAfter = false;
}

/** Send a chat line (the server cleans, filters and relays it; we show it when it comes back). */
export function sendChat(raw: string): boolean {
  const text = cleanChatText(raw);
  if (!text || useNet.getState().status !== 'online') return false;
  netLink.send({ t: 'chat', text });
  return true;
}

export function toggleMute(id: string) {
  const s = useChat.getState();
  s.set({ muted: s.muted.includes(id) ? s.muted.filter((m) => m !== id) : [...s.muted, id] });
  if (!s.muted.includes(id)) hideBubble(id);
}

/** Opened the suspicious box online: ask the server for a card. */
export function requestCard() {
  netLink.send({ t: 'card', a: 'deal' });
}
export function peelCard() {
  netLink.send({ t: 'card', a: 'peel' });
}
/** True while you wear a card (your own word is never known here). */
export const wearingCard = () => {
  const id = selfId();
  return !!id && id in useChat.getState().cards;
};

// ---------------------------------------------------------------- speech bubbles (name-tag layer)
const bubbleTimers = new Map<string, number>();
function showBubble(id: string, text: string) {
  const tag = nameTagEls.get(id);
  const el = tag?.querySelector<HTMLElement>('.name-tag__bubble');
  if (!el || !useGame.getState().textChat) return;
  el.textContent = text;
  el.style.display = '';
  window.clearTimeout(bubbleTimers.get(id));
  bubbleTimers.set(id, window.setTimeout(() => hideBubble(id), BUBBLE_MS + text.length * 35));
}
function hideBubble(id: string) {
  window.clearTimeout(bubbleTimers.get(id));
  bubbleTimers.delete(id);
  const el = nameTagEls.get(id)?.querySelector<HTMLElement>('.name-tag__bubble');
  if (el) el.style.display = 'none';
}

/** Where a player's toy is, for the confetti. */
function toyAt(id: string): { x: number; y: number; z: number } | null {
  if (id === selfId()) return { x: player.pos.x, y: player.pos.y, z: player.pos.z };
  const s = remotes.get(id)?.buf.latest();
  return s ? { x: s.x, y: s.y, z: s.z } : null;
}

// ---------------------------------------------------------------- server messages
export function onChat(m: ChatLineMsg) {
  const muted = useChat.getState().muted.includes(m.id);
  addLine({ id: m.id, name: m.name, text: m.text, kind: 'say', ...(m.m ? { masked: true } : {}) });
  if (muted || m.id === selfId()) return;
  showBubble(m.id, m.text);
  if (useGame.getState().textChat && useGame.getState().screen === 'playing') sfx.tick();
}

export function onChatNote(m: ChatNoteMsg) {
  if (m.code === 'slow') {
    addLine({ id: null, name: '', text: m.message, kind: 'note' });
    return;
  }
  useGame.getState().pushTicket({ title: 'Who Am I?', body: m.message, tone: 'info' });
}

export function onCard(m: CardEventMsg) {
  const s = useChat.getState();
  const me = m.id === selfId();
  const cards = { ...s.cards };
  const g = useGame.getState();
  if (m.k === 'on') {
    cards[m.id] = me ? null : (m.w ?? '?');
    s.set({ cards });
    events.emit('prop:jack-card');
    if (me) {
      myCardAt = performance.now();
      sfx.cardSlap();
    }
    return;
  }
  delete cards[m.id];
  s.set({ cards });
  if (m.k === 'off') return;
  const what = m.w ? withArticle(m.w, m.ar ?? 'a') : 'it';
  if (m.k === 'solved') {
    addLine({ id: null, name: '', text: me ? `You guessed it: ${what}!` : `${m.name} guessed it: ${what}!`, kind: 'announce' });
    sfx.cardOff();
    const at = toyAt(m.id);
    if (at) fxQueue.push({ kind: 'card', x: at.x, y: at.y + 4, z: at.z, color: PALETTE.honey });
    if (me) {
      const paid = Array.isArray(g.whoAmIPaid) ? g.whoAmIPaid : [];
      const { reward, paid: next } = rewardWhoAmI(paid, Date.now(), performance.now() - myCardAt);
      if (reward.total > 0) g.set({ profile: applyReward(g.profile, reward, dateKey(new Date())), whoAmIPaid: next });
      else g.set({ whoAmIPaid: next });
      g.pushTicket({ title: 'You guessed it!', body: `You were ${what}.${reward.total ? ` +${cogText(reward.total)}` : ''}`, tone: 'reward' });
    }
  } else {
    addLine({ id: null, name: '', text: me ? `You peeled off your card: it was ${what}.` : `${m.name} peeled off their card: it was ${what}.`, kind: 'announce' });
    if (me) g.pushTicket({ title: 'Peeled off', body: `It was ${what}. Open the box again for a new one.`, tone: 'info' });
  }
}

export function onCards(m: CardsMsg) {
  const me = selfId();
  const cards: Record<string, string | null> = {};
  for (const c of m.c) cards[c.id] = c.id === me ? null : (c.w ?? '?');
  useChat.getState().set({ cards });
}

/** Offline (left the room or lost it for good): no cards; the log is kept until the next room. */
export function resetChat(full: boolean) {
  for (const id of [...bubbleTimers.keys()]) hideBubble(id);
  const s = useChat.getState();
  s.set({ cards: {}, open: false, unread: 0, ...(full ? { lines: [], muted: [] } : {}) });
}
