/**
 * The client's only view of the network: open a socket to the online Hub server, send messages,
 * receive decoded messages, hear when the socket is gone. One implementation: a browser
 * WebSocket. The join flow, reconnects and snapshots (client.ts) sit above this interface, so
 * tests or a different transport could slot in without touching them.
 */
import type { ClientMsg } from './protocol';

export interface TransportHandlers {
  /** A decoded message from the server (validated by the caller). */
  onMessage(msg: unknown): void;
  /** The socket is gone (or never opened). */
  onClose(info: { code?: number; reason?: string }): void;
}

export interface TransportConn {
  send(msg: ClientMsg): void;
  close(): void;
}

export interface Transport {
  connect(handlers: TransportHandlers): TransportConn;
}

/** Plain WebSocket to the server at `url`. Messages sent before it opens are queued. */
export function wsTransport(url: string): Transport {
  return {
    connect(h) {
      const ws = new WebSocket(url);
      const queue: string[] = [];
      let closed = false;
      ws.addEventListener('open', () => {
        for (const m of queue.splice(0)) ws.send(m);
      });
      ws.addEventListener('message', (ev) => {
        if (typeof ev.data !== 'string') return;
        let data: unknown;
        try {
          data = JSON.parse(ev.data);
        } catch {
          return;
        }
        h.onMessage(data);
      });
      ws.addEventListener('close', (ev) => {
        if (closed) return;
        closed = true;
        h.onClose({ code: ev.code, reason: ev.reason });
      });
      return {
        send(msg) {
          const data = JSON.stringify(msg);
          if (ws.readyState === WebSocket.OPEN) ws.send(data);
          else if (ws.readyState === WebSocket.CONNECTING) queue.push(data);
        },
        close() {
          closed = true;
          if (ws.readyState === WebSocket.CONNECTING) ws.addEventListener('open', () => ws.close(1000, 'bye'));
          else ws.close(1000, 'bye');
        },
      };
    },
  };
}
