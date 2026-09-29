import {
  ApiErrorResponseSchema,
  PoseResponseSchema,
  TagListResponseSchema,
  TagResponseSchema,
} from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import { createManualTimer, type ManualTimer } from "../test-support/manual-timer.ts";
import { buildAsciiStl } from "../test-support/mesh-fixtures.ts";
import {
  createTestWorkspace,
  importMesh,
  type RawResponse,
  sendJsonRequest,
  sendRaw,
  startTestServer,
  type TestWorkspace,
} from "../test-support/test-server.ts";
import type { RunningPantinServer } from "./server.ts";

let workspace: TestWorkspace;
let clock: ManualTimer;
let server: RunningPantinServer;

beforeEach(async () => {
  workspace = await createTestWorkspace();
  clock = createManualTimer();
  server = await startTestServer(workspace.pantinsDirectory, { simulationTimer: clock.timer });
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
  await server.close();
  await workspace.remove();
});

function writeTag(tagName: string, value: unknown): Promise<RawResponse> {
  return sendJsonRequest(server, "PUT", `/api/pantins/axis/tags/${tagName}`, { value });
}

async function readTags() {
  return TagListResponseSchema.parse((await sendRaw(server, "GET", "/api/pantins/axis/tags")).json);
}

async function carriageTranslation(): Promise<readonly number[]> {
  const pose = PoseResponseSchema.parse(
    (await sendRaw(server, "GET", "/api/pantins/axis/pose")).json,
  );
  return pose.bodies.find((body) => body.bodyId === "carriage")?.translation ?? [];
}

function errorCodeOf(response: RawResponse): string {
  return ApiErrorResponseSchema.parse(response.json).error.code;
}

describe("axis driven by a tag (phase 2 exit criterion)", () => {
  it("moves the axis at the next simulation step after the setpoint is written", async () => {
    const written = await writeTag("stroke.setpoint", 0.05);
    expect(written.status).toBe(200);
    expect(TagResponseSchema.parse(written.json).tag).toEqual({
      name: "stroke.setpoint",
      type: "float",
      direction: "command",
      value: 0.05,
    });
    expect(await carriageTranslation()).toEqual([0, 0, 0]);

    clock.advance(STEP_SECONDS);

    const tags = await readTags();
    expect(tags.stepCount).toBe(1);
    expect(tags.tags).toEqual([
      { name: "stroke.setpoint", type: "float", direction: "command", value: 0.05 },
      { name: "stroke.position", type: "float", direction: "feedback", value: 0.05 },
    ]);
    const translation = await carriageTranslation();
    expect(translation[0]).toBeCloseTo(0.05, 12);
  });

  it("clamps a setpoint beyond the limits", async () => {
    await writeTag("stroke.setpoint", 3);
    clock.advance(STEP_SECONDS);
    const position = (await readTags()).tags.find((tag) => tag.name === "stroke.position");
    expect(position?.value).toBe(0.1);
  });

  it("counts simulated steps, not requests", async () => {
    clock.advance(STEP_SECONDS * 3);
    clock.advance(STEP_SECONDS * 2);
    expect((await readTags()).stepCount).toBe(5);
  });

  it("does not overwrite a direct position set after the setpoint was applied", async () => {
    await writeTag("stroke.setpoint", 0.05);
    clock.advance(STEP_SECONDS);
    await sendJsonRequest(server, "PUT", "/api/pantins/axis/joints/stroke/position", {
      position: 0.02,
    });
    clock.advance(STEP_SECONDS);
    expect((await carriageTranslation())[0]).toBeCloseTo(0.02, 12);
  });
});

describe("tag write refusals", () => {
  it("refuses to write a feedback tag", async () => {
    const response = await writeTag("stroke.position", 0.05);
    expect(response.status).toBe(400);
    expect(errorCodeOf(response)).toBe("invalid_request");
  });

  it("answers not_found for an unknown tag", async () => {
    const response = await writeTag("missing.setpoint", 0);
    expect(response.status).toBe(404);
  });

  it("refuses a value that is not a number", async () => {
    const response = await writeTag("stroke.setpoint", "0.05");
    expect(response.status).toBe(400);
  });

  it("refuses a malformed tag name in the URL", async () => {
    const response = await writeTag("stroke", 0);
    expect(errorCodeOf(response)).toBe("invalid_request");
  });

  it("forgets the setpoint of a deleted joint", async () => {
    await writeTag("stroke.setpoint", 0.05);
    const deleted = await sendRaw(server, "DELETE", "/api/pantins/axis/joints/stroke");
    expect(deleted.status).toBe(200);
    clock.advance(STEP_SECONDS);
    expect((await readTags()).tags).toEqual([]);
    expect(await carriageTranslation()).toEqual([0, 0, 0]);
  });

  it("forgets setpoints on discard", async () => {
    await sendRaw(server, "POST", "/api/pantins/axis/save");
    await writeTag("stroke.setpoint", 0.05);
    await sendRaw(server, "POST", "/api/pantins/axis/discard");
    clock.advance(STEP_SECONDS);
    const tags = (await readTags()).tags.map((tag) => tag.value);
    expect(tags).toEqual([0, 0]);
  });
});
