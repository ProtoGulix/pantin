import { PANTIN_SCHEMA_VERSION, type PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { stepSensors } from "./sensor-step.ts";

// Sensors at each simulation step (ADR 0025 point 1).

function body(id: string) {
  return {
    id,
    name: id,
    assembly: "main",
    source: {
      fileName: "a.stl",
      format: "stl" as const,
      unit: "mm" as const,
      upAxis: "z" as const,
      nodes: [],
    },
    mesh: `meshes/${id}.stl`,
  };
}

const DOCUMENT: PantinDocument = {
  schema_version: PANTIN_SCHEMA_VERSION,
  name: "Axis",
  assemblies: [{ key: "main", name: "main" }],
  bodies: [body("rail"), body("carriage")],
  joints: [
    {
      id: "stroke",
      tagKey: "stroke",
      name: "Stroke",
      type: "prismatic",
      parent: "rail",
      child: "carriage",
      origin: [0, 0, 0],
      axis: [1, 0, 0],
      limits: [0, 0.1],
    },
  ],
  drives: [],
  actuators: [],
  sensors: [
    {
      id: "reed",
      tagKey: "reed",
      name: "Reed",
      assembly: "main",
      joint: "stroke",
      type: "cylinder_switch",
      position: 0.05,
      windowWidth: 0.004,
      hysteresis: 0.001,
      normallyClosed: false,
    },
  ],
};

describe("stepSensors", () => {
  it("carries each sensor's state from one step to the next", () => {
    let outputs = new Map();
    const states: number[] = [];
    // Into the window, 0.5 mm past its edge (held by the 1 mm hysteresis), then 1.1 mm past it.
    for (const position of [0.049, 0.0525, 0.0531]) {
      outputs = stepSensors(DOCUMENT, new Map([["stroke", position]]), outputs);
      states.push(outputs.get("reed")?.values.state);
    }
    expect(states).toEqual([1, 1, 0]);
  });

  it("starts without history: past the window but inside the hysteresis it is off", () => {
    const outputs = stepSensors(DOCUMENT, new Map([["stroke", 0.0525]]), new Map());
    expect(outputs.get("reed")?.values.state).toBe(0);
  });
});
