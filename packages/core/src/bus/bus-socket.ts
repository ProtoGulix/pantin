import type { RawData, WebSocket } from "ws";

// The little of a WebSocket that a bus connection uses, so that the
// connection logic never touches the `ws` library (CLAUDE.md section 8.4).
export type BusSocket = {
  send(text: string): void;
  // Starts the closing handshake with an application code (TAG_BUS_CLOSE_CODES).
  close(code: number, reason: string): void;
  ping(): void;
  // Bytes accepted by send() that the peer has not read yet.
  bufferedAmount(): number;
  // Drops the connection with no handshake: the peer is not answering.
  terminate(): void;
};

// RFC 6455 section 5.5: a close reason is at most 123 bytes.
const MAX_CLOSE_REASON_BYTES = 123;

function truncatedReason(reason: string): string {
  return Buffer.from(reason).subarray(0, MAX_CLOSE_REASON_BYTES).toString("utf8");
}

export function adaptWebSocket(socket: WebSocket): BusSocket {
  return {
    // The callback keeps a send on a socket that just closed from throwing:
    // the 'close' event is what ends the connection.
    send: (text) => socket.send(text, () => undefined),
    close: (code, reason) => socket.close(code, truncatedReason(reason)),
    ping: () => socket.ping(),
    bufferedAmount: () => socket.bufferedAmount,
    terminate: () => socket.terminate(),
  };
}

export function rawDataToText(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }
  return data instanceof ArrayBuffer ? Buffer.from(data).toString("utf8") : data.toString("utf8");
}
