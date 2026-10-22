import { connect, createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { deferred } from "./deferred.ts";
import type { Logger } from "./logger.ts";
import { guardOutgoingSockets, refusalOfRemote } from "./socket-guard.ts";

describe("refusalOfRemote", () => {
  const lan = [{ target: "192.168.1.10", port: 4840 }];
  const local = [{ target: "127.0.0.1", port: 4840 }];

  it("accepts the address and port of a module", () => {
    expect(refusalOfRemote("192.168.1.10", 4840, lan)).toBeUndefined();
    expect(refusalOfRemote("127.0.0.1", 4840, local)).toBeUndefined();
  });

  it("refuses another address or another port, whatever it is", () => {
    expect(refusalOfRemote("192.168.1.11", 4840, lan)).toContain("not the address and port");
    expect(refusalOfRemote("192.168.1.10", 4841, lan)).toContain("not the address and port");
    expect(refusalOfRemote(undefined, undefined, lan)).toContain("unknown");
  });

  it("compares an IPv4-mapped IPv6 form with the IPv4 target", () => {
    expect(refusalOfRemote("::ffff:192.168.1.10", 4840, lan)).toBeUndefined();
  });
});

async function listeningServer(): Promise<{ port: number; close: () => void }> {
  const server = createServer((socket) => socket.on("error", () => undefined));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("The test server has no TCP address.");
  }
  return { port: address.port, close: () => server.close() };
}

function recordingLog(lines: string[]): Logger {
  const ignore = (): void => undefined;
  return { debug: ignore, info: ignore, warning: ignore, error: (line) => lines.push(line) };
}

describe("guardOutgoingSockets", () => {
  it("destroys a client socket that reaches an address no module has, and logs it", async () => {
    const server = await listeningServer();
    const lines: string[] = [];
    const stop = guardOutgoingSockets(
      [{ target: "127.0.0.1", port: server.port + 1 }],
      recordingLog(lines),
    );
    const closed = deferred<void>();

    const socket = connect(server.port, "127.0.0.1");
    socket.on("close", () => closed.resolve());
    socket.on("error", () => undefined);
    await closed.promise;
    stop();
    server.close();

    expect(lines).toEqual([expect.stringContaining("not the address and port of any module")]);
  });

  it("leaves a socket to a module alone", async () => {
    const server = await listeningServer();
    const lines: string[] = [];
    const stop = guardOutgoingSockets(
      [{ target: "127.0.0.1", port: server.port }],
      recordingLog(lines),
    );
    const connected = deferred<void>();

    const socket = connect(server.port, "127.0.0.1", () => connected.resolve());
    await connected.promise;
    socket.destroy();
    stop();
    server.close();

    expect(lines).toEqual([]);
  });
});
