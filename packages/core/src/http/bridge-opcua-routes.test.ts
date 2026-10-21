import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BridgeListResponseSchema, type TransportConfig } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFakeSpawner, type FakeSpawner } from "../test-support/fake-bridge-child.ts";
import { createOpcuaTransport } from "../test-support/opcua-transport.ts";
import {
  addOpcuaModules,
  copyPlcCylinder,
  freePort,
  PLC_CYLINDER_ID,
} from "../test-support/plc-cylinder.ts";
import { openSse, type SseClient } from "../test-support/sse-client.ts";
import {
  createTestWorkspace,
  startTestServer,
  type TestWorkspace,
} from "../test-support/test-server.ts";
import type { RunningPantinServer } from "./server.ts";

// PUT .../bridges/opcua_client through the real routes (ADR 0065 points 8 and 9): the
// target classes, the exact targets, the passwords and the Cloudflare exposure.

const BRIDGES = `/api/pantins/${PLC_CYLINDER_ID}/bridges`;
const PATH = `${BRIDGES}/opcua_client`;
const MARKER = "marker-password-77aa";
const EXPOSED = { "x-pantin-exposure": "cloudflare" };
const EXPOSURE_MESSAGE =
  "Through the remote exposure Pantin connects only to a PLC on this host (127.0.0.1 or ::1), without passwords or certificate trust. Open the viewer on the host for these.";

function module(fields: Record<string, unknown>): TransportConfig {
  return {
    ...createOpcuaTransport(),
    securityMode: "SignAndEncrypt",
    securityPolicy: "Basic256Sha256",
    ...fields,
  } as TransportConfig; // Test data merged by hand, then read back through the schema.
}

let workspace: TestWorkspace;
let server: RunningPantinServer | undefined;
let stream: SseClient | undefined;
let spawner: FakeSpawner;

beforeEach(async () => {
  workspace = await createTestWorkspace();
  await copyPlcCylinder(workspace.pantinsDirectory, await freePort());
  await addOpcuaModules(workspace.pantinsDirectory, {
    ua_open: module({ securityMode: "None", securityPolicy: "None" }),
    ua_user: module({ auth: { kind: "user", userName: "operator" } }),
  });
  spawner = createFakeSpawner();
  server = await startTestServer(workspace.pantinsDirectory, {
    hostAddresses: () => ["127.0.0.1"],
    bridgeLaunchers: [
      {
        kind: "opcua_client",
        command: "/node",
        args: ["/opcua/main.ts"],
        hostArguments: ["--pki-dir", "/pki"],
      },
    ],
    bridgeSpawn: spawner.spawn,
  });
});

afterEach(async () => {
  stream?.close();
  stream = undefined;
  await server?.close();
  server = undefined;
  await workspace.remove();
});

async function put(
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; text: string }> {
  const response = await fetch(`http://127.0.0.1:${server?.address.port}${PATH}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, text: await response.text() };
}

function errorMessage(text: string): string {
  return (JSON.parse(text) as { error: { message: string } }).error.message;
}

const ALL_LOOPBACK = { ua_open: "127.0.0.1", ua_user: "127.0.0.1" };
const START = { running: true, targets: ALL_LOOPBACK, passwords: { ua_user: MARKER } };

describe("the targets, through the route", () => {
  it.each([
    ["a host name", "plc.local"],
    ["0.0.0.0", "0.0.0.0"],
    ["another loopback address", "127.0.0.2"],
    ["a public address", "8.8.8.8"],
    ["a link-local address", "169.254.3.4"],
  ])("answers 400 to %s and spawns nothing", async (_name, target) => {
    const { status, text } = await put({ ...START, targets: { ...ALL_LOOPBACK, ua_open: target } });
    expect(status).toBe(400);
    expect(errorMessage(text)).toContain('"ua_open"');
    expect(spawner.calls).toHaveLength(0);
  });

  it("answers 400 to an unknown and to a missing key, naming it", async () => {
    const unknown = await put({ ...START, targets: { ...ALL_LOOPBACK, ghost: "127.0.0.1" } });
    expect(unknown.status).toBe(400);
    expect(errorMessage(unknown.text)).toContain('"ghost"');
    const missing = await put({ ...START, targets: { ua_user: "127.0.0.1" } });
    expect(missing.status).toBe(400);
    expect(errorMessage(missing.text)).toContain('"ua_open"');
  });

  it("starts with a private-network target for a secured module, and warns for an open one", async () => {
    const targets = { ua_open: "192.168.1.10", ua_user: "192.168.1.11" };
    const { status } = await put({ ...START, targets });
    expect(status).toBe(200);
    const console = await fetch(
      `http://127.0.0.1:${server?.address.port}/api/pantins/${PLC_CYLINDER_ID}/console`,
    );
    expect(console.status).toBe(200);
    expect(await console.text()).toContain('"opcua_unsecured_lan"');
    expect(spawner.calls[0]?.args.slice(-4)).toEqual([
      "--target",
      "ua_open=192.168.1.10",
      "--target",
      "ua_user=192.168.1.11",
    ]);
  });

  it("answers 400 to a user login with security None toward a private-network target", async () => {
    await addOpcuaModules(workspace.pantinsDirectory, {
      ua_clear: module({
        securityMode: "None",
        securityPolicy: "None",
        auth: { kind: "user", userName: "operator" },
      }),
    });
    const targets = { ...ALL_LOOPBACK, ua_clear: "192.168.1.12" };
    const { status, text } = await put({
      ...START,
      targets,
      passwords: { ua_user: MARKER, ua_clear: MARKER },
    });
    expect(status).toBe(400);
    expect(errorMessage(text)).toContain("ua_clear");
    expect(text).not.toContain(MARKER);
  });
});

describe("the passwords, through the route", () => {
  it("answers 400 to a user module with no password, and to a password for an anonymous module", async () => {
    const none = await put({ running: true, targets: ALL_LOOPBACK });
    expect(none.status).toBe(400);
    expect(errorMessage(none.text)).toContain('"ua_user"');
    const anonymous = await put({ ...START, passwords: { ua_user: MARKER, ua_open: MARKER } });
    expect(anonymous.status).toBe(400);
    expect(errorMessage(anonymous.text)).toContain('"ua_open"');
    expect(none.text + anonymous.text).not.toContain(MARKER);
  });

  it("shows the marker password nowhere: status, SSE, console, log file, command line", async () => {
    stream = await openSse(
      server?.address.port ?? 0,
      `/api/pantins/${PLC_CYLINDER_ID}/pose/stream`,
    );
    const started = await put(START);
    expect(started.status).toBe(200);
    expect(JSON.parse(started.text)).toMatchObject({ network: { targets: ALL_LOOPBACK } });
    spawner.children[0]?.writeStderr("2026-10-17 10:00:01,000 WARNING module ua_user: retrying\n");
    spawner.children[0]?.end(1, null);
    await stream.waitUntil(() => stream?.bridges.at(-1)?.bridges[1]?.state === "failed");

    expect(spawner.children[0]?.stdinText()).toContain(MARKER);
    const status = await fetch(`http://127.0.0.1:${server?.address.port}${BRIDGES}`);
    const consoleResponse = await fetch(
      `http://127.0.0.1:${server?.address.port}/api/pantins/${PLC_CYLINDER_ID}/console`,
    );
    expect(consoleResponse.status).toBe(200);
    const logFile = await readFile(
      join(workspace.pantinsDirectory, ".logs", PLC_CYLINDER_ID, "bridge-opcua_client.log"),
      "utf8",
    );
    const shown = [
      await status.text(),
      JSON.stringify(stream.bridges),
      await consoleResponse.text(),
      logFile,
      JSON.stringify(spawner.calls),
      JSON.stringify(BridgeListResponseSchema.parse(stream.bridges.at(-1))),
    ].join("\n");
    expect(logFile).toContain("ua_user");
    expect(shown).not.toContain(MARKER);
  });
});

describe("the Cloudflare exposure", () => {
  it.each([
    [
      "a private-network target",
      { ...START, targets: { ...ALL_LOOPBACK, ua_open: "192.168.1.10" } },
    ],
    ["a password", START],
    [
      "a trusted certificate",
      { running: true, targets: ALL_LOOPBACK, passwords: {}, trust: ["a".repeat(64)] },
    ],
  ])("answers 403 with the exact message for %s", async (_name, body) => {
    const { status, text } = await put(body, EXPOSED);
    expect(status).toBe(403);
    expect(errorMessage(text)).toBe(EXPOSURE_MESSAGE);
    expect(spawner.calls).toHaveLength(0);
  });

  it("lets loopback targets through with the password stored by a start on the host", async () => {
    expect((await put(START)).status).toBe(200);
    await put({ running: false });
    spawner.children[0]?.end(0, null);
    const exposed = await put({ running: true, targets: ALL_LOOPBACK }, EXPOSED);
    expect(exposed.status).toBe(200);
    expect(spawner.children[1]?.stdinText()).toContain(MARKER);
  });

  it("still answers 400 for loopback targets that need a password the core does not hold", async () => {
    const { status } = await put({ running: true, targets: ALL_LOOPBACK }, EXPOSED);
    expect(status).toBe(400);
  });

  it("lets a stop through", async () => {
    expect((await put({ running: false }, EXPOSED)).status).toBe(200);
  });
});
