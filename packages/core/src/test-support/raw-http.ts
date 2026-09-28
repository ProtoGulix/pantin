import { connect } from "node:net";

export type RawExchange = { host: string; port: number; localAddress?: string; request: string };

// Writes a raw HTTP request on a fresh socket and collects everything received
// until the server closes it. Controls the source address and the Host header.
export function rawHttpExchange(exchange: RawExchange): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(
      exchange.localAddress === undefined
        ? { host: exchange.host, port: exchange.port }
        : { host: exchange.host, port: exchange.port, localAddress: exchange.localAddress },
      () => socket.write(exchange.request),
    );
    let received = "";
    socket.on("data", (chunk: Buffer) => {
      received += chunk.toString("utf8");
    });
    socket.on("close", () => resolve(received));
    socket.on("error", (error: Error & { code?: string }) => {
      // A reset from the source filter is an expected outcome, not a failure.
      if (error.code !== "ECONNRESET" && error.code !== "EPIPE") {
        reject(error);
      }
    });
  });
}

export function getRequest(path: string, host: string): string {
  return `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`;
}
