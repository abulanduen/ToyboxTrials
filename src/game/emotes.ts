/**
 * Hub emotes ("gestures"): ids, labels and timing. Pure data (no DOM, no three.js) so the online
 * server, the protocol, the shop catalogue and the character animation all share one definition.
 *
 * The first four are free for everyone; the rest are sold at the Odds & Ends shop (see the
 * catalogue in cosmetics.ts). A player plays the four gestures equipped in their loadout on keys
 * 1–4 or the touch Emote menu.
 */
export const EMOTE_IDS = ['wave', 'cheer', 'spin', 'bow', 'dance', 'laugh', 'sit', 'salute', 'juggle', 'faint'] as const;
export type EmoteId = (typeof EMOTE_IDS)[number];

/** Every new toy starts with these four, in this order (keys 1–4). */
export const FREE_EMOTES: readonly EmoteId[] = ['wave', 'cheer', 'spin', 'bow'];
/** How many gestures a player can have equipped at once (keys 1–4). */
export const GESTURE_SLOTS = 4;

export const EMOTE_LABELS: Record<EmoteId, string> = {
  wave: 'Wave',
  cheer: 'Cheer',
  spin: 'Spin',
  bow: 'Bow',
  dance: 'Dance',
  laugh: 'Laugh',
  sit: 'Sit',
  salute: 'Salute',
  juggle: 'Juggle',
  faint: 'Faint',
};

/** How long an emote plays, in seconds. */
export const EMOTE_DURATION = 2;
/** Minimum gap between two emotes from one player, in seconds (the server enforces it too). */
export const EMOTE_COOLDOWN = 1.5;

export function isEmoteId(v: unknown): v is EmoteId {
  return typeof v === 'string' && (EMOTE_IDS as readonly string[]).includes(v);
}
