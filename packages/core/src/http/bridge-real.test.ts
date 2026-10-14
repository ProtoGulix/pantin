import { spawn } from "node:child_process";
import { connect } from "node:net";
import { type BridgeStatus, BridgeStatusSchema, ConsoleResponseSchema } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRealSimulationTimer } from "../service/simulation-loop.ts";
import { copyPlcCylinder, freePort, PLC_CYLINDER_ID } from "../test-support/plc-cylinder.ts";
import {
  createTestWorkspace,
  sendJsonRequest,
  sendRaw,
  startTestServer,
  type TestWorkspace,
} from "../test-support/test-server.ts";
import type { RunningPantinServer } from "./server.ts";

// End to end with the real bridge of packages/bridge (ADR 0050). It needs that
// package's environment, so it only runs when PANTIN_BRIDGE_PYTHON points to
// its interpreter; `pnpm test` sets it.
const bridgePython = process.env.PANTIN_BRIDGE_PYTHON;
const BRIDGE_PATH = `/api/pantins/${PLC_CYLINDER_ID}/bridge`;
const WAIT_MILLISECONDS = 20_000;

let workspace: TestWorkspace;
let server: RunningPantinServer | undefined;
let modbusPort = 0;
// Every child the core started, so that a failing test cannot leak one.
const childProcessIds: number[] = [];

beforeEach(async () => {
  workspace = await createTestWorkspace();
  modbusPort = await freePort();
  await copyPlcCylinder(workspace.pantinsDirectory, modbusPort);
  childProcessIds.length = 0;
});

afterEach(async () => {
  for (const pid of childProcessIds) {
    if (isAlive(pid)) {
      process.kill(pid, "SIGKILL");
    }
  }
  await server?.close();
  server = undefined;
  await workspace.remove();
});

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function startServerWithBridge(): Promise<RunningPantinServer> {
  const real = createRealSimulationTimer();
  server = await startTestServer(workspace.pantinsDirectory, {
    simulationTimer: real,
    streamTimer: real,
    busTimer: real,
    ...(bridgePython === undefined
      ? {}
      : {
          bridgePython,
          bridgeSpawn: (command, args, options) => {
            const child = spawn(command, [...args], options);
            if (child.pid !== undefined) {
              childProcessIds.push(child.pid);
            }
            return child;
          },
        }),
  });
  return server;
}

async function bridgeStatus(): Promise<BridgeStatus> {
  const response = await sendRaw(requireServer(), "GET", BRIDGE_PATH);
  return BridgeStatusSchema.parse(response.json);
}

function requireServer(): RunningPantinServer {
  if (server === undefined) {
    throw new Error("Start the server first.");
  }
  return server;
}

async function startBridge(): Promise<void> {
  const body = { running: true, listen: "127.0.0.1", allow: [] };
  const response = await sendJsonRequest(requireServer(), "PUT", BRIDGE_PATH, body);
  expect(response.status).toBe(200);
}

async function waitForState(state: BridgeStatus["state"]): Promise<BridgeStatus> {
  const deadline = Date.now() + WAIT_MILLISECONDS;
  for (;;) {
    const status = await bridgeStatus();
    if (status.state === state) {
      return status;
    }
    if (Date.now() > deadline) {
      throw new Error(`Bridge still ${status.state}, wanted ${state}: ${JSON.stringify(status)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

// Modbus TCP "read 1 coil at address 0" for unit 1: the module counts a PLC as
// connected from its first request, not from the TCP handshake.
const READ_ONE_COIL = Buffer.from("000100000006010100000001", "hex");

// A PLC talking to the module shows in the status (plc_status on the bus).
async function expectPlcConnectedWhileSocketOpen(): Promise<void> {
  const socket = connect({ host: "127.0.0.1", port: modbusPort });
  socket.once("connect", () => socket.write(READ_ONE_COIL));
  try {
    const deadline = Date.now() + WAIT_MILLISECONDS;
    for (;;) {
      const status = await bridgeStatus();
      if (status.modules[0]?.plcConnected === true) {
        return;
      }
      if (Date.now() > deadline) {
        throw new Error(`The PLC never showed as connected: ${JSON.stringify(status)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } finally {
    socket.destroy();
  }
}

async function waitUntilClosed(port: number): Promise<void> {
  const deadline = Date.now() + WAIT_MILLISECONDS;
  while (await canConnect(port)) {
    if (Date.now() > deadline) {
      throw new Error(`Port ${port} is still open.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const describeWithBridge = describe.skipIf(bridgePython === undefined);

describeWithBridge("the real PLC bridge, a full run", () => {
  it("starts, serves its module, fails on an io edit, restarts and stops", async () => {
    await startServerWithBridge();
    await startBridge();
    const running = await waitForState("running");
    expect(running.modules).toEqual([{ key: "m1", port: modbusPort, plcConnected: false }]);
    expect(await canConnect(modbusPort)).toBe(true);
    await expectPlcConnectedWhileSocketOpen();

    const edit = await sendJsonRequest(
      requireServer(),
      "PATCH",
      `/api/pantins/${PLC_CYLINDER_ID}/io/modules/m1`,
      { watchdogMilliseconds: 2000 },
    );
    expect(edit.status).toBe(200);
    const failed = await waitForState("failed");
    expect(failed.failure?.kind).toBe("mapping_changed");
    expect(failed.modules).toEqual([]);
    await waitUntilClosed(modbusPort);
    const consoleAnswer = await sendRaw(
      requireServer(),
      "GET",
      `/api/pantins/${PLC_CYLINDER_ID}/console`,
    );
    const codes = ConsoleResponseSchema.parse(consoleAnswer.json).entries.map(
      (entry) => entry.code,
    );
    expect(codes).toContain("bridge_failed");

    await startBridge();
    await waitForState("running");
    await sendJsonRequest(requireServer(), "PUT", BRIDGE_PATH, { running: false });
    const stopped = await waitForState("stopped");
    expect(stopped.failure).toBeNull();
    await waitUntilClosed(modbusPort);
  }, 60_000);
});

describeWithBridge("the real PLC bridge, ending", () => {
  it("leaves no child process once the core is closed", async () => {
    await startServerWithBridge();
    await startBridge();
    await waitForState("running");
    expect(childProcessIds).toHaveLength(1);
    await requireServer().close();
    server = undefined;
    for (const pid of childProcessIds) {
      expect(isAlive(pid)).toBe(false);
    }
    await waitUntilClosed(modbusPort);
  }, 60_000);

  it("reports a killed child as crashed", async () => {
    await startServerWithBridge();
    await startBridge();
    await waitForState("running");
    const [pid] = childProcessIds;
    if (pid === undefined) {
      throw new Error("The core did not start a bridge child.");
    }
    process.kill(pid, "SIGKILL");
    const failed = await waitForState("failed");
    expect(failed.failure).toMatchObject({ kind: "crashed", signal: "SIGKILL" });
  }, 60_000);
});
