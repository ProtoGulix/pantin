import { describe, expect, it } from "vitest";
import { layoutChainDiagram } from "./chain-layout.ts";
import {
  BAND_GAP,
  BAND_HEADER_HEIGHT,
  columnX,
  MIN_ROW_PITCH,
  NODE_WIDTH,
} from "./diagram-constants.ts";
import { bodyOf, cylinderOf, documentOf, driveOf, encoderOf, jointOf } from "./diagram-fixtures.ts";
import type { ChainDiagram, DiagramNode } from "./diagram-types.ts";

const NONE: ReadonlySet<string> = new Set();

function nodeOf(diagram: ChainDiagram, id: string): DiagramNode {
  const node = diagram.nodes.find((candidate) => candidate.id === id);
  if (node === undefined) {
    throw new Error(`No node ${id}`);
  }
  return node;
}

function centreY(node: DiagramNode): number {
  return node.y + node.height / 2;
}

// One valve, two cylinders, each moving its own joint, watched by an encoder.
const fanOut = documentOf({
  assemblies: ["a"],
  bodies: [bodyOf("r1", "a"), bodyOf("r2", "a")],
  joints: [jointOf("j1", "r1"), jointOf("j2", "r2")],
  drives: [driveOf("valve", "a")],
  actuators: [cylinderOf("c2", "a", "valve", ["j2"]), cylinderOf("c1", "a", "valve", ["j1"])],
  sensors: [encoderOf("e1", "a", "j1")],
});

describe("layoutChainDiagram sockets and columns", () => {
  it("fans one valve out to two cylinders, children in id order, parent centred", () => {
    const diagram = layoutChainDiagram(fanOut, NONE);
    const valve = nodeOf(diagram, "drive:valve");
    const c1 = nodeOf(diagram, "actuator:c1");
    const c2 = nodeOf(diagram, "actuator:c2");
    expect(c1.y).toBeLessThan(c2.y);
    expect(centreY(valve)).toBeCloseTo((centreY(c1) + centreY(c2)) / 2);
    expect(new Set(diagram.nodes.map((node) => node.column))).toEqual(new Set([0, 1, 2, 3]));
    const fed = diagram.edges.filter((edge) => edge.kind === "pneumatic");
    expect(fed.map((edge) => edge.label)).toEqual([
      "port_2 → rod",
      "port_4 → cap",
      "port_2 → rod",
      "port_4 → cap",
    ]);
    expect(fed.every((edge) => edge.fromNode === "drive:valve")).toBe(true);
  });

  it("places columns at fixed x and gives a drive its tags on the left, ports on the right", () => {
    const valve = nodeOf(layoutChainDiagram(fanOut, NONE), "drive:valve");
    expect(valve.x).toBe(columnX(0));
    const left = valve.sockets.filter((socket) => socket.side === "left");
    const right = valve.sockets.filter((socket) => socket.side === "right");
    expect(left.map((socket) => socket.tagName)).toEqual(["a.valve.coil_14", "a.valve.coil_12"]);
    expect(right.map((socket) => [socket.id, socket.domain])).toEqual([
      ["out:port_2", "pneumatic"],
      ["out:port_4", "pneumatic"],
    ]);
    expect(left.every((socket) => socket.x === valve.x)).toBe(true);
    expect(right.every((socket) => socket.x === valve.x + NODE_WIDTH)).toBe(true);
  });

  it("puts sensors in the last column, under their joint, with their tag on the right", () => {
    const diagram = layoutChainDiagram(fanOut, NONE);
    const sensor = nodeOf(diagram, "sensor:e1");
    const joint = nodeOf(diagram, "joint:j1");
    expect(sensor.column).toBe(3);
    expect(centreY(sensor)).toBeCloseTo(centreY(joint));
    expect(sensor.sockets.filter((socket) => socket.side === "right")[0]?.tagName).toMatch(
      /^a\.e1\./,
    );
    expect(diagram.edges.filter((edge) => edge.kind === "observation")).toHaveLength(1);
  });
});

describe("layoutChainDiagram chains", () => {
  it("lets one actuator move two joints, in id order, as mechanical edges", () => {
    const document = documentOf({
      assemblies: ["a"],
      bodies: [bodyOf("l", "a"), bodyOf("r", "a")],
      joints: [jointOf("right", "r"), jointOf("left", "l")],
      drives: [driveOf("valve", "a")],
      actuators: [cylinderOf("cyl", "a", "valve", ["right", "left"])],
    });
    const diagram = layoutChainDiagram(document, NONE);
    const mechanical = diagram.edges.filter((edge) => edge.kind === "mechanical");
    expect(mechanical.map((edge) => edge.toNode)).toEqual(["joint:left", "joint:right"]);
    expect(nodeOf(diagram, "joint:left").y).toBeLessThan(nodeOf(diagram, "joint:right").y);
  });

  it("draws a chain across two assemblies once, in its root's band, with a badge", () => {
    const document = documentOf({
      assemblies: ["a", "b"],
      bodies: [bodyOf("rod", "b")],
      joints: [jointOf("stroke", "rod")],
      drives: [driveOf("valve", "a")],
      actuators: [cylinderOf("cyl", "b", "valve", ["stroke"])],
      sensors: [encoderOf("enc", "b", "stroke")],
    });
    const diagram = layoutChainDiagram(document, NONE);
    expect(diagram.nodes.filter((node) => node.elementId === "stroke")).toHaveLength(1);
    expect(diagram.nodes.every((node) => node.band === "a")).toBe(true);
    expect(nodeOf(diagram, "drive:valve").foreignAssembly).toBeUndefined();
    expect(nodeOf(diagram, "actuator:cyl").foreignAssembly).toEqual({ key: "b", name: "B" });
    expect(nodeOf(diagram, "joint:stroke").foreignAssembly?.key).toBe("b");
    expect(nodeOf(diagram, "sensor:enc").foreignAssembly?.key).toBe("b");
  });
});

describe("layoutChainDiagram orphans and bands", () => {
  it("gives an orphan actuator empty input sockets and an orphan joint a row of its own", () => {
    const document = documentOf({
      assemblies: ["a"],
      bodies: [bodyOf("rod", "a")],
      joints: [jointOf("free", "rod")],
      actuators: [cylinderOf("lonely", "a", null, [])],
    });
    const diagram = layoutChainDiagram(document, NONE);
    const actuator = nodeOf(diagram, "actuator:lonely");
    expect(actuator.sockets.filter((socket) => socket.role === "input")).toHaveLength(2);
    expect(diagram.edges).toEqual([]);
    expect(nodeOf(diagram, "joint:free").y).toBeGreaterThan(actuator.y);
  });

  it("gives a drive that feeds nothing a row", () => {
    const document = documentOf({
      assemblies: ["a"],
      bodies: [],
      drives: [driveOf("idle", "a")],
    });
    const diagram = layoutChainDiagram(document, NONE);
    expect(diagram.nodes.map((node) => node.id)).toEqual(["drive:idle"]);
    expect(diagram.bands[0]?.height).toBeGreaterThanOrEqual(BAND_HEADER_HEIGHT + MIN_ROW_PITCH);
  });

  it("leaves fixed joints out", () => {
    const document = documentOf({
      assemblies: ["a"],
      bodies: [bodyOf("stop", "a")],
      joints: [jointOf("stop", "stop", "fixed")],
    });
    expect(layoutChainDiagram(document, NONE).nodes).toEqual([]);
  });

  it("collapses a band to its header, without nodes, and moves the next band up", () => {
    const document = documentOf({
      assemblies: ["a", "b"],
      bodies: [bodyOf("rod", "a"), bodyOf("rod2", "b")],
      joints: [jointOf("j", "rod"), jointOf("k", "rod2")],
      drives: [driveOf("valve", "a")],
      actuators: [cylinderOf("cyl", "a", "valve", ["j"])],
    });
    const open = layoutChainDiagram(document, NONE);
    const closed = layoutChainDiagram(document, new Set(["a"]));
    expect(closed.bands[0]).toMatchObject({ collapsed: true, height: BAND_HEADER_HEIGHT });
    expect(closed.nodes.every((node) => node.band === "b")).toBe(true);
    expect(closed.edges).toEqual([]);
    expect(closed.bands[1]?.y).toBe((closed.bands[0]?.y ?? 0) + BAND_HEADER_HEIGHT + BAND_GAP);
    expect(closed.bands[1]?.y).toBeLessThan(open.bands[1]?.y ?? 0);
    expect(closed.height).toBeLessThan(open.height);
  });
});

describe("layoutChainDiagram determinism", () => {
  it("is deterministic and independent of the order of the document's lists", () => {
    const reversed = documentOf({
      assemblies: ["a"],
      bodies: [bodyOf("r2", "a"), bodyOf("r1", "a")],
      joints: [jointOf("j2", "r2"), jointOf("j1", "r1")],
      drives: [driveOf("valve", "a")],
      actuators: [cylinderOf("c1", "a", "valve", ["j1"]), cylinderOf("c2", "a", "valve", ["j2"])],
      sensors: [encoderOf("e1", "a", "j1")],
    });
    const first = layoutChainDiagram(fanOut, NONE);
    expect(layoutChainDiagram(fanOut, NONE)).toEqual(first);
    expect(layoutChainDiagram(reversed, NONE)).toEqual(first);
  });
});
