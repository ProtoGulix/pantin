import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import { createManualTimer, type ManualTimer } from "../test-support/manual-timer.ts";
import { buildAsciiStl } from "../test-support/mesh-fixtures.ts";
import { openSse, type SseClient } from "../test-support/sse-client.ts";
import {
  createTestWorkspace,
  importMesh,
  sendJsonRequest,
  startTestServer,
  type TestWorkspace,
} from "../test-support/test-server.ts";
import type { RunningPantinServer } from "./server.ts";

// The `clock` event and the paused pose cadence of the pose stream (ADR 0032 point 9).

const PERIOD_SECONDS = 1 / 30;

let workspace: TestWorkspace;
let simulationClock: ManualTimer;
let streamClock: ManualTimer;
let server: RunningPantinServer;
let client: SseClient;

beforeEach(async () => {
  workspace = await createTestWorkspace();
  simulationClock = createManualTimer();
  streamClock = createManualTimer();
  server = await startTestServer(workspace.pantinsDirectory, {
    simulationTimer: simulationClock.timer,
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
  client = await openSse(server.address.port, "/api/pantins/axis/pose/stream");
  await client.waitUntil(() => client.clocks.length === 1);
});

afterEach(async () => {
  client.close();
  await server.close();
  await workspace.remove();
});

const setRunning = (running: boolean) =>
  sendJsonRequest(server, "PUT", "/api/pantins/axis/clock", { running });

const editPosition = (position: number) =>
  sendJsonRequest(server, "PUT", "/api/pantins/axis/joints/stroke/position", { position });

// Keep-alives travel on the same socket: once one arrives, everything sent
// before it has arrived too, so "nothing was sent" is checkable. The manual
// timer fires a keep-alive only after its 15 s, so none comes from earlier
// advances. It moves wall time by 15 s, so call it last in a test.
async function flush(): Promise<void> {
  const expected = client.comments.length + 1;
  streamClock.advance(15);
  await client.waitUntil(() => client.comments.length >= expected);
}

// A scheduler tick after `wallSeconds` of wall time.
function tickAfter(wallSeconds: number): void {
  streamClock.advance(wallSeconds);
  simulationClock.advance(STEP_SECONDS);
}

describe("clock event", () => {
  it("is sent on open, after the first pose", () => {
    expect(client.eventNames).toEqual(["pose", "clock"]);
    expect(client.clocks[0]).toMatchObject({ running: true, step: 0, stepSeconds: STEP_SECONDS });
  });

  it("is sent when the clock is paused and resumed", async () => {
    await setRunning(false);
    await client.waitUntil(() => client.clocks.length === 2);
    await setRunning(true);
    await client.waitUntil(() => client.clocks.length === 3);
    expect(client.clocks.map((clock) => clock.running)).toEqual([true, false, true]);
  });

  it("is not sent when the value does not change", async () => {
    await setRunning(true);
    await setRunning(false);
    await client.waitUntil(() => client.clocks.length === 2);
    await setRunning(false);
    await flush();
    expect(client.clocks).toHaveLength(2);
  });

  it("is sent once per second of wall time while running, not while paused", async () => {
    streamClock.advance(1);
    await client.waitUntil(() => client.clocks.length === 2);
    streamClock.advance(1);
    await client.waitUntil(() => client.clocks.length === 3);
    await setRunning(false);
    await client.waitUntil(() => client.clocks.length === 4);
    streamClock.advance(1);
    streamClock.advance(1);
    await flush();
    expect(client.clocks).toHaveLength(4);
  });

  it("is sent after a step request, with the poses after the steps", async () => {
    await setRunning(false);
    await sendJsonRequest(server, "PUT", "/api/pantins/axis/tags/carriage.stroke.setpoint", {
      value: 0.05,
    });
    await client.waitUntil(() => client.clocks.length === 2);
    await sendJsonRequest(server, "POST", "/api/pantins/axis/clock/step", { steps: 3 });
    await client.waitUntil(() => client.clocks.length === 3);
    await client.waitUntil(() => client.snapshots.length === 2);
    expect(client.clocks[2]).toMatchObject({ running: false, step: 3 });
    expect(client.snapshots[1]?.stepCount).toBe(3);
    expect(client.snapshots[1]?.jointPositions[0]?.position).toBeGreaterThan(0);
    expect(client.eventNames.slice(-2)).toEqual(["clock", "pose"]);
  });
});

describe("paused pose cadence", () => {
  it("sends a direct joint position edit within 1/30 s of wall time", async () => {
    await setRunning(false);
    await editPosition(0.02);
    tickAfter(PERIOD_SECONDS);
    await client.waitUntil(() => client.snapshots.length === 2);
    expect(client.snapshots[1]?.jointPositions[0]?.position).toBeCloseTo(0.02, 12);
    expect(client.snapshots[1]?.stepCount).toBe(0);
  });

  it("does not send an edit before 1/30 s of wall time", async () => {
    await setRunning(false);
    await editPosition(0.02);
    tickAfter(PERIOD_SECONDS / 2);
    await flush();
    expect(client.snapshots).toHaveLength(1);
  });

  it("does not send again before 1/30 s after the last send", async () => {
    await setRunning(false);
    await editPosition(0.02);
    tickAfter(PERIOD_SECONDS);
    await client.waitUntil(() => client.snapshots.length === 2);
    await editPosition(0.03);
    tickAfter(PERIOD_SECONDS / 2);
    await flush();
    expect(client.snapshots).toHaveLength(2);
  });

  it("sends nothing while paused and nothing moved", async () => {
    await setRunning(false);
    tickAfter(PERIOD_SECONDS);
    tickAfter(PERIOD_SECONDS);
    await flush();
    expect(client.snapshots).toHaveLength(1);
  });
});
