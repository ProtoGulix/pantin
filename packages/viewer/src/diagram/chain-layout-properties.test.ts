import type { PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { layoutChainDiagram } from "./chain-layout.ts";
import {
  actuatorOf,
  bodyOf,
  cylinderOf,
  documentOf,
  driveOf,
  encoderOf,
  jointOf,
} from "./diagram-fixtures.ts";
import { edgePairs, overlapping, pathsMeet, pathsShareSegment } from "./diagram-geometry.ts";

// Invariants of ADR 0029 checked on generated documents: a small seeded
// generator, so that a failure is reproducible from the seed alone.

function randomSource(seed: number): () => number {
  let state = seed;
  return () => {
    // Numerical Recipes LCG: good enough to vary shapes, not for statistics.
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

type Chain = "valve_5_2" | "valve_3_2" | "servo" | "vfd" | "free" | "fixed";
const CHAINS: Chain[] = ["valve_5_2", "valve_3_2", "servo", "vfd", "free", "fixed"];

// The mutable lists one generated document is made of.
interface GeneratedParts {
  bodies: object[];
  joints: object[];
  drives: object[];
  actuators: object[];
  movable: string[];
}

function emptyParts(): GeneratedParts {
  return { bodies: [], joints: [], drives: [], actuators: [], movable: [] };
}

function generate(seed: number): PantinDocument {
  const random = randomSource(seed);
  const pick = (count: number) => Math.floor(random() * count);
  const assemblies = ["a", "b", "c"].slice(0, 1 + pick(3));
  const assembly = () => assemblies[pick(assemblies.length)] ?? "a";
  const parts = emptyParts();
  const addJoint = (type: string) => {
    const id = `j${parts.joints.length}`;
    parts.bodies.push(bodyOf(`b${id}`, assembly()));
    parts.joints.push(jointOf(id, `b${id}`, type));
    if (type !== "fixed") {
      parts.movable.push(id);
    }
    return id;
  };
  const count = 2 + pick(6);
  for (let index = 0; index < count; index++) {
    addChain(parts, `x${index}`, CHAINS[pick(CHAINS.length)] ?? "free", {
      addJoint,
      assembly,
      pick,
    });
  }
  const sensors = parts.movable
    .filter(() => random() < 0.5)
    .map((joint, index) => encoderOf(`e${index}`, assembly(), joint));
  return documentOf({ assemblies, ...parts, sensors });
}

interface Tools {
  addJoint: (type: string) => string;
  assembly: () => string;
  pick: (count: number) => number;
}

function addChain(parts: GeneratedParts, id: string, chain: Chain, tools: Tools) {
  const { addJoint, assembly, pick } = tools;
  const mine = assembly();
  if (chain === "free" || chain === "fixed") {
    addJoint(chain === "free" ? "revolute" : "fixed");
    return;
  }
  if (chain === "valve_5_2" || chain === "valve_3_2") {
    parts.drives.push(
      driveOf(id, mine, chain === "valve_5_2" ? "valve_5_2_double" : "valve_3_2_single"),
    );
    // A 5/2 valve fans out to one to three cylinders; a 3/2 feeds single-acting ones.
    for (let index = 0; index < 1 + pick(3); index++) {
      const joints = pick(4) === 0 ? [] : [addJoint("prismatic")];
      parts.actuators.push(
        chain === "valve_5_2"
          ? cylinderOf(`${id}c${index}`, assembly(), id, joints, feedPorts(pick(2) === 0))
          : singleCylinder(`${id}c${index}`, assembly(), id, joints),
      );
    }
    return;
  }
  parts.drives.push(
    chain === "servo"
      ? { ...driveOf(id, mine, "servo_drive"), maxSpeed: 1, maxAcceleration: 2 }
      : { ...driveOf(id, mine, "vfd_analog"), acceleration: 50 },
  );
  const fields =
    chain === "servo" ? { type: "servo_motor" } : { type: "ac_motor", nominalSpeed: 5 };
  const joints = [addJoint(chain === "servo" ? "prismatic" : "continuous")];
  parts.actuators.push(
    actuatorOf(`${id}m`, assembly(), fields, { drive: id, ports: { in: "out" } }, joints),
  );
}

// The usual wiring of a 5/2 valve, or the two ports swapped: the case that makes wires cross.
function feedPorts(swapped: boolean): Record<string, string> {
  return swapped ? { cap: "port_2", rod: "port_4" } : { cap: "port_4", rod: "port_2" };
}

function singleCylinder(id: string, assembly: string, drive: string, joints: string[]) {
  const fields = { type: "single_acting_cylinder", extendSpeed: 0.2, returnSpeed: 0.2 };
  return actuatorOf(id, assembly, fields, { drive, ports: { cap: "port_2" } }, joints);
}

const SEEDS = Array.from({ length: 400 }, (_, seed) => seed + 1);

describe("layoutChainDiagram invariants", () => {
  it.each(SEEDS)("keeps nodes apart and edges clear of one another (seed %i)", (seed) => {
    const diagram = layoutChainDiagram(generate(seed), new Set(seed % 2 === 0 ? ["b"] : []), "en");
    expect(overlapping(diagram)).toEqual([]);
    // Edges of different nodes never meet; edges of one node may cross (a swapped
    // feed) but never run along one another, except the shared trunk of one socket.
    expect(edgePairs(diagram, (a, b) => a.fromNode !== b.fromNode && pathsMeet(a, b))).toEqual([]);
    expect(
      edgePairs(
        diagram,
        (a, b) =>
          a.fromNode === b.fromNode && a.fromSocket !== b.fromSocket && pathsShareSegment(a, b),
      ),
    ).toEqual([]);
  });

  it.each(SEEDS)("keeps nodes unique, inside their band, in reading order (seed %i)", (seed) => {
    const diagram = layoutChainDiagram(generate(seed), new Set(seed % 2 === 0 ? ["b"] : []), "en");
    const ids = diagram.nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    const bandOf = new Map(diagram.bands.map((band) => [band.key, band]));
    for (const node of diagram.nodes) {
      const band = bandOf.get(node.band);
      expect(node.y).toBeGreaterThanOrEqual(band?.y ?? Number.POSITIVE_INFINITY);
      expect(node.y + node.height).toBeLessThanOrEqual((band?.y ?? 0) + (band?.height ?? 0));
    }
    const order = diagram.nodes.map((node) => [
      diagram.bands.findIndex((band) => band.key === node.band),
      node.row,
      node.column,
    ]);
    expect(order).toEqual(
      [...order].sort(
        (a, b) =>
          (a[0] ?? 0) - (b[0] ?? 0) || (a[1] ?? 0) - (b[1] ?? 0) || (a[2] ?? 0) - (b[2] ?? 0),
      ),
    );
  });

  it.each(SEEDS)("draws every movable element once when nothing is collapsed (seed %i)", (seed) => {
    const document = generate(seed);
    const movable = document.joints.filter((joint) => joint.type !== "fixed").length;
    const expected =
      document.drives.length + document.actuators.length + document.sensors.length + movable;
    expect(layoutChainDiagram(document, new Set(), "en").nodes).toHaveLength(expected);
  });
});
