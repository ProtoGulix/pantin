import { type Joint, PANTIN_SCHEMA_VERSION, type PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { ApiError } from "../errors.ts";
import { describeJointTags, jointOfCommandTag } from "./joint-tags.ts";
import { applyQueuedSetpoints } from "./simulation-step.ts";

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
    { key: "frame", name: "Frame" },
    { key: "axis_800", name: "Axis 800" },
  ],
  bodies: [body("rail", "frame"), body("carriage", "axis_800"), body("tool", "axis_800")],
  joints: [stroke, clamp],
  drives: [],
};

const noRuntime = { jointPositions: new Map(), setpoints: new Map() };

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

describe("describeJointTags", () => {
  it("gives a setpoint and a position to each movable joint, none to a fixed one", () => {
    expect(describeJointTags(document, noRuntime)).toEqual([
      { name: "axis_800.stroke.setpoint", type: "float", direction: "command", value: 0 },
      { name: "axis_800.stroke.position", type: "float", direction: "feedback", value: 0 },
    ]);
  });

  it("reports the last written setpoint and the current position", () => {
    const runtime = {
      jointPositions: new Map([["stroke", 0.04]]),
      setpoints: new Map([["stroke", 0.2]]),
    };
    expect(describeJointTags(document, runtime).map((tag) => tag.value)).toEqual([0.2, 0.04]);
  });
});

describe("jointOfCommandTag", () => {
  it("finds the joint of a setpoint tag", () => {
    expect(jointOfCommandTag(document, "axis_800.stroke.setpoint")).toBe(stroke);
  });

  it("refuses to write a feedback tag", () => {
    expect(apiErrorOf(() => jointOfCommandTag(document, "axis_800.stroke.position")).code).toBe(
      "invalid_request",
    );
  });

  it.each([
    "axis_800.stroke.speed",
    "axis_800.missing.setpoint",
    "axis_800.clamp.setpoint",
    "frame.stroke.setpoint",
  ])("does not know %s", (name) => {
    expect(apiErrorOf(() => jointOfCommandTag(document, name)).code).toBe("not_found");
  });
});

describe("jointOfCommandTag messages", () => {
  it("names the tags of a joint whose member is wrong", () => {
    expect(apiErrorOf(() => jointOfCommandTag(document, "axis_800.stroke.speed")).message).toBe(
      'No tag "axis_800.stroke.speed". This joint has "axis_800.stroke.setpoint" and "axis_800.stroke.position".',
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
