import { describe, expect, it } from "vitest";
import { layoutChainDiagram } from "./chain-layout.ts";
import { bodyOf, cylinderOf, documentOf, driveOf, jointOf } from "./diagram-fixtures.ts";
import { nodeLitStates, socketLitStates } from "./diagram-lit-states.ts";
import { type LiveState, NO_LIVE_STATE } from "./diagram-live.ts";

const diagram = layoutChainDiagram(
  documentOf({
    assemblies: ["a"],
    bodies: [bodyOf("rod", "a")],
    joints: [jointOf("stroke", "rod")],
    drives: [driveOf("valve", "a")],
    actuators: [cylinderOf("cyl", "a", "valve", ["stroke"])],
  }),
  new Set(),
);

describe("socketLitStates", () => {
  it("says nothing while nothing is lit", () => {
    expect(socketLitStates(diagram, NO_LIVE_STATE).size).toBe(0);
  });

  it("names a bit at 1 active and both ends of a pressurised wire under pressure", () => {
    const wire = diagram.edges.find((edge) => edge.kind === "pneumatic");
    const live: LiveState = {
      ...NO_LIVE_STATE,
      litSockets: new Set(["drive:valve|tag:coil_a"]),
      litEdges: new Set(wire === undefined ? [] : [wire.id]),
    };
    const states = socketLitStates(diagram, live);
    expect(states.get("drive:valve|tag:coil_a")).toBe("active");
    expect(states.get(`${wire?.fromNode}|${wire?.fromSocket}`)).toBe("pressure");
    expect(states.get(`${wire?.toNode}|${wire?.toSocket}`)).toBe("pressure");
  });
});

describe("nodeLitStates", () => {
  it("lists each lit state of a node once", () => {
    const states = new Map([
      ["drive:v|tag:a", "active" as const],
      ["drive:v|tag:b", "active" as const],
      ["drive:v|out:port_4", "pressure" as const],
    ]);
    expect(nodeLitStates(states).get("drive:v")).toEqual(["active", "pressure"]);
  });
});
