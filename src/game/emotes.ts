/**
 * Hub emotes: ids, labels and timing. Pure data (no DOM, no three.js) so the online server, the
 * protocol and the character animation all share one definition.
 */
export const EMOTE_IDS = ['wave', 'cheer', 'spin', 'bow'] as const;
export type EmoteId = (typeof EMOTE_IDS)[number];

export const EMOTE_LABELS: Record<EmoteId, string> = {
  wave: 'Wave',
  cheer: 'Cheer',
  spin: 'Spin',
  bow: 'Bow',
};

/** How long an emote plays, in seconds. */
export const EMOTE_DURATION = 2;
/** Minimum gap between two emotes from one player, in seconds (the server enforces it too). */
export const EMOTE_COOLDOWN = 1.5;

export function isEmoteId(v: unknown): v is EmoteId {
  return typeof v === 'string' && (EMOTE_IDS as readonly string[]).includes(v);
}
