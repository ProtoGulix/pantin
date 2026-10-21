import { type BridgeStatus, BridgeStatusSchema, ModbusBridgeStatusSchema } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFakeSpawner, type FakeSpawner } from "../test-support/fake-bridge-child.ts";
import { copyPlcCylinder, freePort, PLC_CYLINDER_ID } from "../test-support/plc-cylinder.ts";
import { openSse, type SseClient } from "../test-support/sse-client.ts";
import {
  createTestWorkspace,
  startTestServer,
  type TestWorkspace,
} from "../test-support/test-server.ts";
import type { RunningPantinServer } from "./server.ts";

const BRIDGE_PATH = `/api/pantins/${PLC_CYLINDER_ID}/bridges/modbus_tcp_slave`;
const START = { running: true, listen: "127.0.0.1", allow: [] };

let workspace: TestWorkspace;
let server: RunningPantinServer | undefined;
let stream: SseClient | undefined;

beforeEach(async () => {
  workspace = await createTestWorkspace();
  await copyPlcCylinder(workspace.pantinsDirectory, await freePort());
});

afterEach(async () => {
  stream?.close();
  stream = undefined;
  await server?.close();
  server = undefined;
  await workspace.remove();
});

async function startServer(spawner?: FakeSpawner): Promise<RunningPantinServer> {
  server = await startTestServer(workspace.pantinsDirectory, {
    hostAddresses: () => ["127.0.0.1", "192.168.1.20"],
    ...(spawner === undefined
      ? {}
      : {
          bridgeLaunchers: [
            {
              kind: "modbus_tcp_slave",
              command: "/venv/bin/python",
              args: ["-m", "pantin_bridge"],
            },
          ],
          bridgeSpawn: spawner.spawn,
        }),
  });
  return server;
}

async function call(
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: unknown }> {
  const running = server;
  if (running === undefined) {
    throw new Error("Start the server first.");
  }
  const response = await fetch(`http://127.0.0.1:${running.address.port}${BRIDGE_PATH}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, json: await response.json() };
}

// GET .../bridges, the Modbus entry of its list (the one route that reads a status).
async function getModbusStatus(
  headers: Record<string, string> = {},
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(
    `http://127.0.0.1:${server?.address.port}/api/pantins/${PLC_CYLINDER_ID}/bridges`,
    { headers },
  );
  const body = (await response.json()) as { bridges?: { transport: string }[] };
  return {
    status: response.status,
    json: body.bridges?.find((bridge) => bridge.transport === "modbus_tcp_slave") ?? body,
  };
}

function errorCodeOf(json: unknown): string | undefined {
  return (json as { error?: { code?: string } }).error?.code;
}

describe("without --bridge-python", () => {
  it("reports the Modbus bridge as unavailable and lists the listen choices", async () => {
    await startServer();
    const { status, json } = await getModbusStatus();
    const body = ModbusBridgeStatusSchema.parse(json);
    expect(status).toBe(200);
    expect(body).toMatchObject({ availability: "unavailable", state: "stopped", network: null });
    expect(body.listenChoices).toEqual(["127.0.0.1", "192.168.1.20"]);
  });

  it("answers bridge_unavailable to a start", async () => {
    await startServer();
    const { status, json } = await call("PUT", START);
    expect(status).toBe(503);
    expect(errorCodeOf(json)).toBe("bridge_unavailable");
  });
});

describe("with a bridge Python", () => {
  it("starts and stops, answering the status at each step", async () => {
    const spawner = createFakeSpawner();
    await startServer(spawner);
    const started = await call("PUT", START);
    expect(started.status).toBe(200);
    expect(BridgeStatusSchema.parse(started.json)).toMatchObject({
      availability: "available",
      state: "starting",
      network: { listen: "127.0.0.1", allow: [] },
    });
    expect(spawner.calls[0]?.args).toContain("--status-lines");
    const stopped = await call("PUT", { running: false });
    expect(BridgeStatusSchema.parse(stopped.json).state).toBe("stopped");
    expect((await getModbusStatus()).status).toBe(200);
  });

  it("starts and stops through the cloudflare exposure (ADR 0050, 2026-10-16 amendment)", async () => {
    const spawner = createFakeSpawner();
    await startServer(spawner);
    const exposed = { "x-pantin-exposure": "cloudflare" };
    expect((await call("PUT", START, exposed)).status).toBe(200);
    expect(spawner.calls).toHaveLength(1);
    expect((await call("PUT", { running: false }, exposed)).status).toBe(200);
    expect((await getModbusStatus(exposed)).status).toBe(200);
  });
});

describe("the start check reads the Modbus projection of the mapping (ADR 0065 point 7)", () => {
  it("starts although an OPC UA module is still missing its namespace", async () => {
    const spawner = createFakeSpawner();
    const running = await startServer(spawner);
    const base = `http://127.0.0.1:${running.address.port}/api/pantins/${PLC_CYLINDER_ID}/io`;
    const added = await fetch(`${base}/modules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transport: { kind: "opcua_client" } }),
    });
    expect(added.status).toBe(201);
    const whole = (await (await fetch(base)).json()) as { status: string };
    expect(whole.status).toBe("invalid");

    const started = await call("PUT", START);
    expect(started.status).toBe(200);
    expect(BridgeStatusSchema.parse(started.json).state).toBe("starting");
    expect(spawner.calls).toHaveLength(1);
  });

  it("is still refused when a Modbus module is invalid", async () => {
    const spawner = createFakeSpawner();
    const running = await startServer(spawner);
    const base = `http://127.0.0.1:${running.address.port}/api/pantins/${PLC_CYLINDER_ID}/io`;
    const modules = (await (await fetch(base)).json()) as {
      modules: { key: string; channels: { tag: string }[] }[];
    };
    const first = modules.modules[0];
    const channel = first?.channels[0];
    if (first === undefined || channel === undefined) {
      throw new Error("plc-cylinder maps at least one tag.");
    }
    await fetch(`${base}/modules/${first.key}/channels/${channel.tag}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variable: "1 bad" }),
    });
    const refused = await call("PUT", START);
    expect(refused.status).toBe(409);
    expect(spawner.calls).toHaveLength(0);
  });
});

describe("with a bridge Python, refusals", () => {
  it.each([
    ["an unknown field", { ...START, python: "/bin/sh" }],
    ["a wildcard address", { ...START, listen: "0.0.0.0" }],
    ["a stop with a listen field", { running: false, listen: "127.0.0.1" }],
    [
      "a private address of another machine",
      { running: true, listen: "10.9.9.9", allow: ["10.0.0.0/8"] },
    ],
  ])("answers 400 to %s, through the exposure too", async (_name, body) => {
    const spawner = createFakeSpawner();
    await startServer(spawner);
    for (const headers of [{}, { "x-pantin-exposure": "cloudflare" }]) {
      const { status, json } = await call("PUT", body, headers);
      expect(status).toBe(400);
      expect(errorCodeOf(json)).toBe("invalid_request");
    }
    expect(spawner.calls).toHaveLength(0);
  });

  it("answers 404 for an unknown Pantin", async () => {
    await startServer(createFakeSpawner());
    const response = await fetch(
      `http://127.0.0.1:${server?.address.port}/api/pantins/nobody/bridges`,
    );
    expect(response.status).toBe(404);
  });
});

function modbusStates(client: SseClient | undefined): string[] {
  return (client?.bridges ?? []).flatMap(({ bridges }) =>
    bridges.filter((status) => status.transport === "modbus_tcp_slave").map(({ state }) => state),
  );
}

describe("the bridge event of the pose stream", () => {
  it("is sent when the stream opens and on each change", async () => {
    const spawner = createFakeSpawner();
    const running = await startServer(spawner);
    stream = await openSse(running.address.port, `/api/pantins/${PLC_CYLINDER_ID}/pose/stream`);
    await stream.waitUntil(() => stream?.bridges.length === 1);
    expect(stream.bridges[0]?.bridges.map((status) => status.transport)).toEqual([
      "modbus_tcp_slave",
      "opcua_client",
    ]);
    expect(modbusStates(stream)).toEqual(["stopped"]);
    await call("PUT", START);
    spawner.children[0]?.writeStdout(
      `${JSON.stringify({ event: "ready", transport: "modbus_tcp_slave", listen: "127.0.0.1", modules: [{ key: "m1", port: 1502 }] })}\n`,
    );
    await stream.waitUntil(() => modbusStates(stream).at(-1) === "running");
    const last: BridgeStatus | undefined = stream.bridges.at(-1)?.bridges[0];
    expect(last?.modules).toEqual([
      { key: "m1", endpoint: "127.0.0.1:1502", plcConnected: false, reason: null },
    ]);
    expect(modbusStates(stream)).toEqual(["stopped", "starting", "running"]);
  });
});

describe("the bridge log route", () => {
  async function getLog(path: string): Promise<Response> {
    return fetch(`http://127.0.0.1:${server?.address.port}${path}`);
  }

  it("answers an empty text/plain body when there is no file yet", async () => {
    await startServer(createFakeSpawner());
    const response = await getLog(`${BRIDGE_PATH}/log`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(await response.text()).toBe("");
  });

  it("answers the file, as an attachment with ?download=1", async () => {
    const spawner = createFakeSpawner();
    await startServer(spawner);
    await call("PUT", START);
    spawner.children[0]?.writeStderr("WARNING module m1 refused a request\n");
    await call("PUT", { running: false });

    const plain = await getLog(`${BRIDGE_PATH}/log`);
    const text = await plain.text();
    expect(text).toMatch(/^\S+Z CORE INFO Start requested: listen 127.0.0.1, allow none.\n/);
    expect(text).toContain("BRIDGE WARNING module m1 refused a request\n");

    const download = await getLog(`${BRIDGE_PATH}/log?download=1`);
    expect(download.headers.get("content-disposition")).toBe(
      `attachment; filename="${PLC_CYLINDER_ID}-bridge-modbus_tcp_slave.log"`,
    );
    expect(await download.text()).toBe(text);
  });

  it("answers 404 for an unknown Pantin", async () => {
    await startServer(createFakeSpawner());
    expect((await getLog("/api/pantins/nobody/bridges/modbus_tcp_slave/log")).status).toBe(404);
  });

  it("keeps the .logs folder out of the Pantin list", async () => {
    const spawner = createFakeSpawner();
    await startServer(spawner);
    await call("PUT", START);
    await call("PUT", { running: false });
    const listed = (await (await getLog("/api/pantins")).json()) as
      | { id: string }[]
      | { pantins: { id: string }[] };
    const ids = (Array.isArray(listed) ? listed : listed.pantins).map(({ id }) => id);
    expect(ids).toEqual([PLC_CYLINDER_ID]);
  });
});
