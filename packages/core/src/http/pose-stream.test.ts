import { ApiErrorResponseSchema } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import { createManualTimer, type ManualTimer } from "../test-support/manual-timer.ts";
import { buildAsciiStl } from "../test-support/mesh-fixtures.ts";
import { openSse, type SseClient } from "../test-support/sse-client.ts";
import {
  createTestWorkspace,
  importMesh,
  sendJsonRequest,
  sendRaw,
  startTestServer,
  type TestWorkspace,
} from "../test-support/test-server.ts";
import { MAX_POSE_STREAMS } from "./pose-stream-registry.ts";
import type { RunningPantinServer } from "./server.ts";

const STREAM_PATH = "/api/pantins/axis/pose/stream";
const PERIOD_STEPS = 4;

let workspace: TestWorkspace;
let clock: ManualTimer;
let streamClock: ManualTimer;
let server: RunningPantinServer;
let clients: SseClient[];

beforeEach(async () => {
  workspace = await createTestWorkspace();
  clock = createManualTimer();
  streamClock = createManualTimer();
  clients = [];
  server = await startTestServer(workspace.pantinsDirectory, {
    simulationTimer: clock.timer,
    streamTimer: streamClock.timer,
  });
  await sendJsonRequest(server, "POST", "/api/pantins", { name: "Axis" });
  await importMesh(server, "axis", "fileName=rail.stl&unit=mm", buildAsciiStl());
  await importMesh(server, "axis", "fileName=carriage.stl&unit=mm", buildAsciiStl());
  await sendJsonRequest(server, "POST", "/api/pantins/axis/joints", {
    type: "prismatic",
    name: "Stroke",
    parent: "rail",
    child: "carriage",
    origin: [0, 0, 0],
    axis: [1, 0, 0],
    limits: [0, 0.1],
  });
});

afterEach(async () => {
  for (const client of clients) {
    client.close();
  }
  await server.close();
  await workspace.remove();
});

async function connect(): Promise<SseClient> {
  const client = await openSse(server.address.port, STREAM_PATH);
  clients.push(client);
  return client;
}

// Keep-alives travel on the same socket as snapshots: once one arrives, every
// snapshot sent before it has arrived too, so "nothing was sent" is checkable.
async function flush(client: SseClient): Promise<void> {
  const expected = client.comments.length + 1;
  streamClock.advance(15);
  await client.waitUntil(() => client.comments.length >= expected);
}

function writeSetpoint(value: number) {
  return sendJsonRequest(server, "PUT", "/api/pantins/axis/tags/carriage.stroke.setpoint", {
    value,
  });
}

function advanceSteps(steps: number): void {
  for (let step = 0; step < steps; step += 1) {
    clock.advance(STEP_SECONDS);
  }
}

describe("pose stream", () => {
  it("answers text/event-stream and sends a snapshot on open", async () => {
    const client = await connect();
    await client.waitUntil(() => client.snapshots.length === 1);
    expect(client.status).toBe(200);
    expect(client.headers["content-type"]).toContain("text/event-stream");
    expect(client.snapshots[0]?.stepCount).toBe(0);
    expect(client.snapshots[0]?.jointPositions).toEqual([{ jointId: "stroke", position: 0 }]);
  });
});

describe("pose stream sending", () => {
  it("sends a written setpoint at the next qualifying tick", async () => {
    const client = await connect();
    await client.waitUntil(() => client.snapshots.length === 1);
    await writeSetpoint(0.05);
    advanceSteps(PERIOD_STEPS);
    await client.waitUntil(() => client.snapshots.length === 2);
    expect(client.snapshots[1]?.stepCount).toBe(PERIOD_STEPS);
    expect(client.snapshots[1]?.jointPositions[0]?.position).toBeCloseTo(0.05, 12);
  });

  it("sends nothing when idle", async () => {
    const client = await connect();
    await client.waitUntil(() => client.snapshots.length === 1);
    advanceSteps(PERIOD_STEPS * 5);
    await flush(client);
    expect(client.snapshots).toHaveLength(1);
  });

  it("sends at most one snapshot per 1/30 s of simulated time", async () => {
    const client = await connect();
    await client.waitUntil(() => client.snapshots.length === 1);
    await writeSetpoint(0.05);
    advanceSteps(PERIOD_STEPS);
    await writeSetpoint(0.06);
    advanceSteps(PERIOD_STEPS - 1);
    await flush(client);
    expect(client.snapshots).toHaveLength(2);
    advanceSteps(1);
    await client.waitUntil(() => client.snapshots.length === 3);
    expect(client.snapshots[2]?.jointPositions[0]?.position).toBeCloseTo(0.06, 12);
  });

  it("sends an edit made outside the loop at the next qualifying tick", async () => {
    const client = await connect();
    await client.waitUntil(() => client.snapshots.length === 1);
    await sendJsonRequest(server, "PUT", "/api/pantins/axis/joints/stroke/position", {
      position: 0.02,
    });
    advanceSteps(PERIOD_STEPS);
    await client.waitUntil(() => client.snapshots.length === 2);
    expect(client.snapshots[1]?.jointPositions[0]?.position).toBeCloseTo(0.02, 12);
  });
});

describe("pose stream upkeep", () => {
  it("sends a keep-alive comment every 15 s", async () => {
    const client = await connect();
    await client.waitUntil(() => client.snapshots.length === 1);
    await flush(client);
    expect(client.comments).toEqual([": keep-alive"]);
  });

  it("answers the usual JSON error for an unknown Pantin, before any stream header", async () => {
    const response = await sendRaw(server, "GET", "/api/pantins/ghost/pose/stream");
    expect(response.status).toBe(404);
    expect(response.contentType).toContain("application/json");
    expect(ApiErrorResponseSchema.parse(response.json).error.code).toBe("not_found");
  });
});

describe("pose stream slots", () => {
  it("refuses the 17th stream with a 409 asking to close a tab", async () => {
    for (let index = 0; index < MAX_POSE_STREAMS; index += 1) {
      await connect();
    }
    const refused = await sendRaw(server, "GET", STREAM_PATH);
    expect(refused.status).toBe(409);
    const { error } = ApiErrorResponseSchema.parse(refused.json);
    expect(error.code).toBe("conflict");
    expect(error.message).toContain("Close a viewer tab");
  });

  it("frees the slot and the keep-alive timer when a client leaves", async () => {
    const opened: SseClient[] = [];
    for (let index = 0; index < MAX_POSE_STREAMS; index += 1) {
      opened.push(await connect());
    }
    expect(streamClock.runningCount()).toBe(MAX_POSE_STREAMS);
    opened[0]?.close();
    // The server notices the closed socket asynchronously.
    await waitForCount(MAX_POSE_STREAMS - 1);
    const accepted = await connect();
    await accepted.waitUntil(() => accepted.snapshots.length === 1);
  });

  it("ends every stream cleanly when the server closes", async () => {
    const client = await connect();
    await client.waitUntil(() => client.snapshots.length === 1);
    await server.close();
    await client.ended();
    expect(streamClock.isRunning()).toBe(false);
    // afterEach closes again: a second close must not hang or throw.
    server = await startTestServer(workspace.pantinsDirectory);
  });
});

async function waitForCount(expected: number): Promise<void> {
  while (streamClock.runningCount() !== expected) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}
