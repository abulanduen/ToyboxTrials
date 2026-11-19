/**
 * Every minigame id, as data. Pure (no React, no DOM) so the online server can validate the
 * "playing <game>" activity a client reports without loading the registry.
 */
export const MINIGAME_IDS = [
  'copycat-conductor',
  'inferno-escape',
  'midnight-hunger',
  'find-the-original',
  'red-light-green-light',
  'blink-duel',
  'wind-up-dash',
  'music-box-rhythm',
  'toy-squad',
  'spellbox-showdown',
  'jack-in-the-box',
  'odd-page-out',
] as const;

export type MinigameId = (typeof MINIGAME_IDS)[number];
