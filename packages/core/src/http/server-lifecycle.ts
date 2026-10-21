import type { Server } from "node:http";
import type { Socket } from "node:net";
import { isSourceAccepted, type NetworkConfig } from "../domain/network-config.ts";

// Registered before Node's own HTTP listener, and destroying synchronously:
// a rejected socket is closed before a single byte of it is read.
export function installSourceFilter(
  server: Server,
  network: NetworkConfig,
  reportRejectedSource: (source: string) => void,
): void {
  server.prependListener("connection", (socket: Socket) => {
    if (!isSourceAccepted(network, socket.remoteAddress)) {
      socket.destroy();
      reportRejectedSource(socket.remoteAddress ?? "unknown");
    }
  });
}

// `stopWork` releases what runs inside the server before its connections are cut.
export function closeServer(server: Server, stopWork: () => void): Promise<void> {
  return new Promise<void>((resolveClose, rejectClose) => {
    stopWork();
    server.close((error) => (error === undefined ? resolveClose() : rejectClose(error)));
    server.closeAllConnections();
  });
}
