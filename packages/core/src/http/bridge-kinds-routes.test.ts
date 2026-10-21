import { BridgeListResponseSchema } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BridgeLauncher } from "../bridge/bridge-supervisor.ts";
import { createFakeSpawner, type FakeSpawner } from "../test-support/fake-bridge-child.ts";
import { copyPlcCylinder, freePort, PLC_CYLINDER_ID } from "../test-support/plc-cylinder.ts";
import {
  createTestWorkspace,
  startTestServer,
  type TestWorkspace,
} from "../test-support/test-server.ts";
import type { RunningPantinServer } from "./server.ts";

// The routes of ADR 0065 point 7 that depend on the kind: the list, the kind in the URL,
// the kind's own request and log. The Modbus start flow is in bridge-routes.test.ts.

const BRIDGES = `/api/pantins/${PLC_CYLINDER_ID}/bridges`;

let workspace: TestWorkspace;
let server: RunningPantinServer | undefined;

beforeEach(async () => {
  workspace = await createTestWorkspace();
  await copyPlcCylinder(workspace.pantinsDirectory, await freePort());
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await workspace.remove();
});

async function startServer(options: { withOpcua: boolean }): Promise<FakeSpawner> {
  const spawner = createFakeSpawner();
  const modbus: BridgeLauncher = {
    kind: "modbus_tcp_slave",
    command: "/venv/bin/python",
    args: ["-m", "x"],
  };
  const opcua: BridgeLauncher = {
    kind: "opcua_client",
    command: "/node",
    args: ["/opcua/main.ts"],
  };
  server = await startTestServer(workspace.pantinsDirectory, {
    hostAddresses: () => ["127.0.0.1"],
    bridgeLaunchers: options.withOpcua ? [modbus, opcua] : [modbus],
    bridgeSpawn: spawner.spawn,
  });
  return spawner;
}

async function request(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; text: string }> {
  const response = await fetch(`http://127.0.0.1:${server?.address.port}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, text: await response.text() };
}

function errorOf(text: string): { code: string; message: string } {
  return (JSON.parse(text) as { error: { code: string; message: string } }).error;
}

describe("GET .../bridges", () => {
  it("lists one status per kind of the registry, in its order", async () => {
    await startServer({ withOpcua: false });
    const { status, text } = await request("GET", BRIDGES);
    const { bridges } = BridgeListResponseSchema.parse(JSON.parse(text));
    expect(status).toBe(200);
    expect(bridges.map(({ transport, availability }) => [transport, availability])).toEqual([
      ["modbus_tcp_slave", "available"],
      ["opcua_client", "unavailable"],
    ]);
    expect(bridges.every(({ network }) => network === null)).toBe(true);
  });

  it("reports a kind with a launcher as available", async () => {
    await startServer({ withOpcua: true });
    const { bridges } = BridgeListResponseSchema.parse(
      JSON.parse((await request("GET", BRIDGES)).text),
    );
    expect(bridges.map(({ availability }) => availability)).toEqual(["available", "available"]);
  });

  it("is gone from the old singular route", async () => {
    await startServer({ withOpcua: false });
    const base = `/api/pantins/${PLC_CYLINDER_ID}/bridge`;
    expect((await request("GET", base)).status).toBe(404);
    expect((await request("PUT", base, { running: false })).status).toBe(404);
    expect((await request("GET", `${base}/log`)).status).toBe(404);
  });
});

describe("an unknown kind in the URL", () => {
  it.each([
    ["PUT", `${BRIDGES}/profibus`, { running: false }],
    ["GET", `${BRIDGES}/profibus/log`, undefined],
  ])("answers 404 with the known kinds: %s %s", async (method, path, body) => {
    await startServer({ withOpcua: false });
    const { status, text } = await request(method, path, body);
    expect(status).toBe(404);
    expect(errorOf(text).message).toContain("modbus_tcp_slave, opcua_client");
  });
});

describe("PUT .../bridges/opcua_client", () => {
  it("answers bridge_unavailable to a start when the core has no program for it", async () => {
    const spawner = await startServer({ withOpcua: false });
    const { status, text } = await request("PUT", `${BRIDGES}/opcua_client`, {
      running: true,
      targets: {},
    });
    expect(status).toBe(503);
    expect(errorOf(text).code).toBe("bridge_unavailable");
    expect(spawner.calls).toHaveLength(0);
  });

  it("stops a bridge that is not running by answering its state", async () => {
    await startServer({ withOpcua: false });
    const { status, text } = await request("PUT", `${BRIDGES}/opcua_client`, { running: false });
    expect(status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({ transport: "opcua_client", state: "stopped" });
  });

  it("refuses a stop request with a field, and a body that is not a request", async () => {
    await startServer({ withOpcua: false });
    const bodies = [
      { running: false, targets: {} },
      { running: "yes" },
      {},
      { running: true },
      { running: true, targets: { plc: "127.0.0.1" }, listen: "127.0.0.1" },
      { running: true, targets: {}, trust: ["not-a-hash"] },
      { running: true, targets: {}, passwords: { plc: "" } },
    ];
    for (const body of bodies) {
      expect((await request("PUT", `${BRIDGES}/opcua_client`, body)).status).toBe(400);
    }
  });

  it("refuses a Modbus request on the Modbus route only when it is not one", async () => {
    await startServer({ withOpcua: false });
    const wrong = await request("PUT", `${BRIDGES}/modbus_tcp_slave`, { running: true });
    expect(wrong.status).toBe(400);
  });

  it("answers 409 when the Pantin has no OPC UA module, and spawns nothing", async () => {
    const spawner = await startServer({ withOpcua: true });
    const { status, text } = await request("PUT", `${BRIDGES}/opcua_client`, {
      running: true,
      targets: {},
    });
    expect(status).toBe(409);
    expect(errorOf(text).message).toContain("no OPC UA client module");
    expect(spawner.calls).toHaveLength(0);
  });
});

describe("GET .../bridges/:kind/log", () => {
  it("reads the file of the kind asked for, and no other", async () => {
    const spawner = await startServer({ withOpcua: true });
    await request("PUT", `${BRIDGES}/modbus_tcp_slave`, {
      running: true,
      listen: "127.0.0.1",
    });
    spawner.children[0]?.writeStderr("WARNING module m1 refused a request\n");
    await request("PUT", `${BRIDGES}/modbus_tcp_slave`, { running: false });

    const modbus = await request("GET", `${BRIDGES}/modbus_tcp_slave/log`);
    const opcua = await request("GET", `${BRIDGES}/opcua_client/log`);
    expect(modbus.text).toContain("BRIDGE WARNING module m1 refused a request");
    expect(opcua).toEqual({ status: 200, text: "" });
  });
});
