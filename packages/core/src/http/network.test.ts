import { readdir } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getRequest, rawHttpExchange } from "../test-support/raw-http.ts";
import {
  createTestWorkspace,
  startTestServer,
  type TestWorkspace,
} from "../test-support/test-server.ts";
import { type RunningPantinServer, StartupRefusedError } from "./server.ts";

let workspace: TestWorkspace;
let servers: RunningPantinServer[];

beforeEach(async () => {
  workspace = await createTestWorkspace();
  servers = [];
});

afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()));
  await workspace.remove();
});

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

function isListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

describe("startup refusal (phase 2 exit criterion)", () => {
  it.each(["8.8.8.8", "0.0.0.0", "::", "169.254.1.1", "localhost"])(
    "startPantinServer refuses %s without opening a socket",
    async (listen) => {
      const port = await freePort();
      const starting = startTestServer(workspace.pantinsDirectory, { port, listen });
      await expect(starting).rejects.toBeInstanceOf(StartupRefusedError);
      await expect(starting).rejects.toThrow(/Refusing to listen/);
      expect(await isListening(port)).toBe(false);
    },
  );
});

describe("source filter", () => {
  let rejectedSources: string[];
  let server: RunningPantinServer;

  beforeEach(async () => {
    rejectedSources = [];
    server = await startTestServer(workspace.pantinsDirectory, {
      listen: "127.0.0.2",
      allow: ["127.0.0.3/32"],
      reportRejectedSource: (source) => rejectedSources.push(source),
    });
    servers.push(server);
  });

  const host = () => `127.0.0.2:${server.address.port}`;

  it("closes a connection from a source outside the allowlist before reading it", async () => {
    const body = '{"name":"Should never exist"}';
    const request = [
      "POST /api/pantins HTTP/1.1",
      `Host: ${host()}`,
      "Content-Type: application/json",
      `Content-Length: ${body.length}`,
      "Connection: close",
      "",
      body,
    ].join("\r\n");
    const received = await rawHttpExchange({
      host: "127.0.0.2",
      port: server.address.port,
      localAddress: "127.0.0.1",
      request,
    });
    expect(received).toBe("");
    expect(rejectedSources).toEqual(["127.0.0.1"]);
    expect(await readdir(workspace.pantinsDirectory)).toEqual([]);
  });

  it("serves a source inside the allowlist", async () => {
    const received = await rawHttpExchange({
      host: "127.0.0.2",
      port: server.address.port,
      localAddress: "127.0.0.3",
      request: getRequest("/api/pantins", host()),
    });
    expect(received).toMatch(/^HTTP\/1\.1 200/);
    expect(rejectedSources).toEqual([]);
  });

  it("reports the loopback listener as local mode", () => {
    expect(server.network.mode).toBe("local");
    expect(server.address.address).toBe("127.0.0.2");
  });
});

describe("host check on a non default listen address", () => {
  it.each([
    ["127.0.0.2", 200],
    ["localhost", 200],
    ["127.0.0.1", 200],
    ["evil.example", 421],
    ["127.0.0.4", 421],
  ])("Host %s gets %i", async (hostName, expectedStatus) => {
    const server = await startTestServer(workspace.pantinsDirectory, { listen: "127.0.0.2" });
    servers.push(server);
    const port = server.address.port;
    const received = await rawHttpExchange({
      host: "127.0.0.2",
      port,
      request: getRequest("/api/pantins", `${hostName}:${port}`),
    });
    expect(received).toMatch(new RegExp(`^HTTP/1\\.1 ${expectedStatus}`));
  });
});
