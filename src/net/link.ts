/**
 * The online client's outbox and clock, as a tiny shared object. client.ts fills it in; the lobby
 * (lobby.ts) and the remote match host (src/minigames/remote.ts) use it without importing the
 * client (which would make an import cycle through the match session).
 */
import type { ClientMsg } from './protocol';

export const netLink = {
  /** Send a message on the current connection (dropped when offline). */
  send: (_msg: ClientMsg): void => {},
  /** Server clock now (ms), or null before the first snapshot. */
  serverTime: (): number | null => null,
};
