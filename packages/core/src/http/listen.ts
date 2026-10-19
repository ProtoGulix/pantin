import type { Server } from "node:http";

// Resolves once the server accepts connections, rejects when the address cannot be bound.
export function listen(server: Server, port: number, address: string): Promise<void> {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, address, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
}
