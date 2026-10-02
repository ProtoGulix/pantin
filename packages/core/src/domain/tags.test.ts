import { type Joint, PANTIN_SCHEMA_VERSION, type PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { ApiError } from "../errors.ts";
import { applyQueuedSetpoints } from "./simulation-step.ts";
import { commandTagOf, describeTags } from "./tags.ts";

const stroke: Joint = {
  id: "stroke",
  tagKey: "stroke",
  name: "Stroke",
  type: "prismatic",
  parent: "rail",
  child: "carriage",
  origin: [0, 0, 0],
  axis: [1, 0, 0],
  limits: [0, 0.1],
};

const clamp: Joint = {
  id: "clamp",
  tagKey: "clamp",
  name: "Clamp",
  type: "fixed",
  parent: "carriage",
  child: "tool",
  origin: [0, 0, 0],
  axis: [1, 0, 0],
};

function body(id: string, assembly: string) {
  return {
    id,
    name: id,
    assembly,
    source: {
      fileName: "axis.stl",
      format: "stl" as const,
      unit: "mm" as const,
      upAxis: "z" as const,
      nodes: [],
    },
    mesh: `meshes/${id}.stl`,
  };
}

// Tags take the key of the child's assembly (ADR 0019): "carriage" is in
// "axis_800", so the stroke's tags start with "axis_800.stroke".
const document: PantinDocument = {
  schema_version: PANTIN_SCHEMA_VERSION,
  name: "Axis",
  assemblies: [
    { key: "frame", name: "Frame", placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] } },
    {
      key: "axis_800",
      name: "Axis 800",
      placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
    },
  ],
  bodies: [body("rail", "frame"), body("carriage", "axis_800"), body("tool", "axis_800")],
  joints: [stroke, clamp],
  drives: [],
  actuators: [],
  sensors: [],
};

const noRuntime = {
  jointPositions: new Map(),
  setpoints: new Map(),
  driveCommands: new Map(),
  driveFeedback: new Map(),
  sensorOutputs: new Map(),
};

function apiErrorOf(action: () => unknown): ApiError {
  try {
    action();
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected an ApiError.");
}

describe("describeTags of joints", () => {
  it("gives a setpoint and a position to each movable joint, none to a fixed one", () => {
    expect(describeTags(document, noRuntime)).toEqual([
      { name: "axis_800.stroke.setpoint", type: "float", direction: "command", value: 0 },
      { name: "axis_800.stroke.position", type: "float", direction: "feedback", value: 0 },
    ]);
  });

  it("reports the last written setpoint and the current position", () => {
    const runtime = {
      ...noRuntime,
      jointPositions: new Map([["stroke", 0.04]]),
      setpoints: new Map([["stroke", 0.2]]),
    };
    expect(describeTags(document, runtime).map((tag) => tag.value)).toEqual([0.2, 0.04]);
  });
});

describe("commandTagOf a joint", () => {
  it("finds the joint of a setpoint tag", () => {
    expect(commandTagOf(document, "axis_800.stroke.setpoint").owner).toEqual({
      kind: "joint",
      joint: stroke,
    });
  });

  it("refuses to write a feedback tag", () => {
    expect(apiErrorOf(() => commandTagOf(document, "axis_800.stroke.position")).code).toBe(
      "invalid_request",
    );
  });

  it.each([
    "axis_800.stroke.speed",
    "axis_800.missing.setpoint",
    "axis_800.clamp.setpoint",
    "frame.stroke.setpoint",
  ])("does not know %s", (name) => {
    expect(apiErrorOf(() => commandTagOf(document, name)).code).toBe("not_found");
  });
});

describe("commandTagOf messages", () => {
  it("names the tags of a joint whose member is wrong", () => {
    expect(apiErrorOf(() => commandTagOf(document, "axis_800.stroke.speed")).message).toBe(
      'No tag "axis_800.stroke.speed". This owner has "axis_800.stroke.setpoint", "axis_800.stroke.position".',
    );
  });
});

describe("applyQueuedSetpoints", () => {
  it("moves a joint to its queued setpoint, clamped to its limits", () => {
    const positions = applyQueuedSetpoints(document, new Map(), new Map([["stroke", 0.5]]));
    expect(positions.get("stroke")).toBe(0.1);
  });

  it("keeps the positions of joints without a queued setpoint", () => {
    const current = new Map([["stroke", 0.03]]);
    expect(applyQueuedSetpoints(document, current, new Map()).get("stroke")).toBe(0.03);
  });

  it("ignores the setpoint of a deleted joint and leaves its input untouched", () => {
    const current = new Map([["stroke", 0.03]]);
    const positions = applyQueuedSetpoints(document, current, new Map([["gone", 1]]));
    expect(positions.has("gone")).toBe(false);
    expect(current).toEqual(new Map([["stroke", 0.03]]));
  });
});
