import {
  type Body,
  type Joint,
  PANTIN_SCHEMA_VERSION,
  type PantinDocument,
  PantinDocumentSchema,
  type SourceNode,
} from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { newAssemblyTree } from "./assemblies.ts";
import { type AssemblyLocation, applyImportFrames, planImportFrames } from "./assembly-frames.ts";
import { addFixedJoints } from "./import-joints.ts";
import { computePoses } from "./kinematics.ts";
import { addAssembly, addBodies, replaceJoint } from "./pantin-document.ts";
import { axisAngleRotation } from "./rigid-transform.ts";
import { type ChainComponent, planStepTree } from "./step-assembly-tree.ts";

function part(...chain: string[]): ChainComponent {
  const nodes: SourceNode[] = chain.map((link) => {
    const [name = "", path = ""] = link.split("@");
    return { name, path: path === "" ? [] : path.split(".").map(Number) };
  });
  return { nodes };
}

const QUARTER_TURN = axisAngleRotation([0, 0, 1], Math.PI / 2);
const NO_LOCATIONS: AssemblyLocation[] = [];

// The whole import pipeline, as import-operations.ts runs it.
function importDocument(components: ChainComponent[], locations: AssemblyLocation[]) {
  const empty: PantinDocument = PantinDocumentSchema.parse({
    schema_version: PANTIN_SCHEMA_VERSION,
    name: "T",
    assemblies: [],
    bodies: [],
    joints: [],
    drives: [],
    actuators: [],
    sensors: [],
  });
  const plan = planStepTree(components, "file");
  const assemblies = newAssemblyTree(empty, plan.assemblies);
  const bodies: Body[] = components.map((component, index) => ({
    id: `b${index}`,
    name: `b${index}`,
    assembly:
      assemblies[plan.assemblies.findIndex((assembly) => assembly.components.includes(index))]
        ?.key ?? "",
    source: {
      fileName: "f.step",
      format: "step",
      unit: "m",
      upAxis: "z",
      nodes: [...component.nodes],
    },
    mesh: `meshes/b${index}.glb`,
  }));
  const withAll = addBodies(assemblies.reduce(addAssembly, empty), bodies);
  const links = plan.links.flatMap(({ parent, child }) => {
    const [p, c] = [bodies[parent], bodies[child]];
    return p === undefined || c === undefined ? [] : [{ parent: p, child: c }];
  });
  const withJoints = addFixedJoints(withAll, links);
  const frames = planImportFrames(plan.assemblies, plan.links, locations);
  return applyImportFrames(withJoints.document, assemblies, bodies, frames);
}

const MACHINE = [
  part("M@0", "plate@0.0"),
  part("M@0", "Sub@0.1", "a@0.1.0"),
  part("M@0", "Sub@0.1", "b@0.1.1"),
];
const SUB_LOCATION: AssemblyLocation = {
  path: [0, 1],
  translation: [1, 2, 0],
  rotation: [...QUARTER_TURN],
};
const MACHINE_LOCATIONS: AssemblyLocation[] = [
  { path: [0], translation: [0.5, 0, 0], rotation: [0, 0, 0, 1] },
  SUB_LOCATION,
];

function poseOf(document: PantinDocument, bodyId: string, positions = new Map<string, number>()) {
  const pose = computePoses(document, positions).find((candidate) => candidate.bodyId === bodyId);
  if (pose === undefined) {
    throw new Error(`No pose for ${bodyId}`);
  }
  return pose;
}

function expectClose(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, at) => {
    expect(actual[at] ?? Number.NaN).toBeCloseTo(value, 9);
  });
}

describe("planImportFrames", () => {
  it("sets nothing when there are no locations", () => {
    const { document } = importDocument(MACHINE, NO_LOCATIONS);
    expect(document.assemblies.map(({ placement }) => placement)).toEqual([
      { translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
      { translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
    ]);
    expect(document.bodies.every((body) => body.placement === undefined)).toBe(true);
  });

  it("keeps every mesh where the CAD puts it", () => {
    const placed = importDocument(MACHINE, MACHINE_LOCATIONS).document;
    const flat = importDocument(MACHINE, NO_LOCATIONS).document;
    for (const body of flat.bodies) {
      const [expected, actual] = [poseOf(flat, body.id), poseOf(placed, body.id)];
      expectClose(actual.translation, expected.translation);
      expectClose(actual.rotation, expected.rotation);
    }
  });

  it("gives a sub-assembly its location relative to its anchor", () => {
    const { document } = importDocument(MACHINE, MACHINE_LOCATIONS);
    const [machine, sub] = document.assemblies;
    // M sits at [0.5, 0, 0] in the world; Sub is anchored to M through plate.
    expect(machine?.placement.translation).toEqual([0.5, 0, 0]);
    expect(sub?.placement.translation).toEqual(SUB_LOCATION.translation);
    expectClose(sub?.placement.rotation ?? [], [...QUARTER_TURN]);
    const bodyOfSub = document.bodies.find((body) => body.id === "b1");
    expectClose(bodyOfSub?.placement?.rotation ?? [], [0, 0, -QUARTER_TURN[2], QUARTER_TURN[3]]);
  });
});

describe("planImportFrames anchors and joints", () => {
  it("anchors to the assembly of the parent body when the STEP parent has no body", () => {
    // R holds only A and B: the handle of R is a1, so B hangs from A, not R.
    const components = [part("R@0", "A@0.0", "a1@0.0.0"), part("R@0", "B@0.1", "b1@0.1.0")];
    const locations: AssemblyLocation[] = [
      { path: [0], translation: [0, 0, 1], rotation: [0, 0, 0, 1] },
      { path: [0, 0], translation: [1, 0, 0], rotation: [...QUARTER_TURN] },
      { path: [0, 1], translation: [0, 3, 0], rotation: [0, 0, 0, 1] },
    ];
    const { document } = importDocument(components, locations);
    const [root, a, b] = document.assemblies;
    // A has no incoming joint between assemblies: world frame, R then A.
    expectClose(a?.placement.translation ?? [], [1, 0, 1]);
    // B = W(A)⁻¹ ∘ W(B): [-1, 3, 0] seen from A turned a quarter turn.
    expectClose(b?.placement.translation ?? [], [3, 1, 0]);
    expectClose(root?.placement.translation ?? [], [0, 0, 1]);
    for (const body of document.bodies) {
      expectClose(poseOf(document, body.id).translation, [0, 0, 0]);
    }
  });

  it("moves a prismatic joint along the world Y in a sub-assembly turned about Z", () => {
    const { document } = importDocument(MACHINE, MACHINE_LOCATIONS);
    const fixed = document.joints.find((joint) => joint.child === "b2");
    if (fixed === undefined) {
      throw new Error("No joint to b2");
    }
    const slide: Joint = { ...fixed, type: "prismatic", axis: [1, 0, 0], limits: [0, 1] };
    const moved = replaceJoint(document, slide);
    const pose = poseOf(moved, "b2", new Map([[slide.id, 0.5]]));
    expectClose(pose.translation, [0, 0.5, 0]);
    expectClose(pose.rotation, [0, 0, 0, 1]);
  });
});
