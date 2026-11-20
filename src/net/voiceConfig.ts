/**
 * ICE servers for voice chat (WebRTC). Pure resolution (tested) plus the value for this build.
 *
 *   - VITE_ICE_SERVERS set → that JSON list, in the RTCIceServer shape, e.g.
 *     `[{"urls":"stun:stun.example.org:3478"},{"urls":"turns:turn.example.org:5349","username":"u","credential":"p"}]`.
 *     `[]` means no STUN/TURN at all (players on the same network only).
 *   - Unset → one public STUN server (DEFAULT_ICE_SERVERS). No TURN unless configured.
 *
 * STUN lets a browser learn its public address so two players on different networks can reach
 * each other directly. It shares the player's public IP address with the STUN provider and, as
 * part of the connection, with the players they talk to. Some networks (strict NATs, many company
 * and school networks, some mobile carriers) block direct connections: those players need a TURN
 * relay, which must be configured here (and costs bandwidth). See docs/ONLINE.md.
 */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

const URL_RE = /^(stun|stuns|turn|turns):[^\s]+$/;

/** Parse VITE_ICE_SERVERS. Anything malformed falls back to the default. */
export function parseIceServers(raw: string | undefined): RTCIceServer[] {
  const text = raw?.trim();
  if (!text) return DEFAULT_ICE_SERVERS;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return DEFAULT_ICE_SERVERS;
  }
  if (!Array.isArray(v)) return DEFAULT_ICE_SERVERS;
  const out: RTCIceServer[] = [];
  for (const s of v) {
    if (!s || typeof s !== 'object') return DEFAULT_ICE_SERVERS;
    const o = s as Record<string, unknown>;
    const urls = typeof o.urls === 'string' ? [o.urls] : Array.isArray(o.urls) ? o.urls : null;
    if (!urls || !urls.length || !urls.every((u) => typeof u === 'string' && URL_RE.test(u))) return DEFAULT_ICE_SERVERS;
    const server: RTCIceServer = { urls: typeof o.urls === 'string' ? o.urls : (urls as string[]) };
    if (typeof o.username === 'string') server.username = o.username;
    if (typeof o.credential === 'string') server.credential = o.credential;
    out.push(server);
  }
  return out;
}

export const ICE_SERVERS: RTCIceServer[] = parseIceServers((import.meta.env as { VITE_ICE_SERVERS?: string } | undefined)?.VITE_ICE_SERVERS);
