import {
  type Body,
  groupEndpoint,
  PANTIN_SCHEMA_VERSION,
  PantinDocumentSchema,
  type SourceNode,
} from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { newAssemblyTree } from "./assemblies.ts";
import { addFixedJoints } from "./import-joints.ts";
import { addAssembly, addBodies } from "./pantin-document.ts";
import { type ChainComponent, planStepTree } from "./step-assembly-tree.ts";

// A component from a chain of "name@path" strings, the last one being the part.
function part(...chain: string[]): ChainComponent {
  const nodes: SourceNode[] = chain.map((link) => {
    const [name = "", path = ""] = link.split("@");
    return { name, path: path === "" ? [] : path.split(".").map(Number) };
  });
  return { nodes };
}

const names = (plan: ReturnType<typeof planStepTree>) =>
  plan.assemblies.map((assembly) => assembly.name);

describe("planStepTree", () => {
  it("makes the single root the top, with its direct parts and nested children", () => {
    const plan = planStepTree(
      [
        part("M@0", "plate@0.0"),
        part("M@0", "Sub@0.1", "a@0.1.0"),
        part("M@0", "Sub@0.1", "b@0.1.1"),
        part("M@0", "rod@0.2"),
      ],
      "file",
    );
    expect(plan.assemblies).toEqual([
      { name: "M", parent: undefined, components: [0, 3], path: [0] },
      { name: "Sub", parent: 0, components: [1, 2], path: [0, 1] },
    ]);
    // Inside M: rod under the handle plate; Sub is joined from plate to a.
    expect(plan.links).toEqual([
      { parent: 0, child: 3 },
      { parent: 0, child: 1 },
      { parent: 1, child: 2 },
    ]);
  });

  it("takes the handle of a root with only sub-assemblies from its first child", () => {
    const plan = planStepTree(
      [
        part("M@0", "A@0.0", "a1@0.0.0"),
        part("M@0", "A@0.0", "a2@0.0.1"),
        part("M@0", "B@0.1", "b1@0.1.0"),
        part("M@0", "C@0.2", "c1@0.2.0"),
      ],
      "file",
    );
    expect(names(plan)).toEqual(["M", "A", "B", "C"]);
    expect(plan.assemblies[0]?.components).toEqual([]);
    // The handle of M is a1 (0): A needs no joint, B and C hang from it.
    expect(plan.links).toContainEqual({ parent: 0, child: 2 });
    expect(plan.links).toContainEqual({ parent: 0, child: 3 });
    expect(plan.links).toContainEqual({ parent: 0, child: 1 });
    expect(plan.links).toHaveLength(3);
  });

  it("puts several roots under an assembly named after the file", () => {
    const plan = planStepTree(
      [part("F@0", "a@0.0"), part("G@1", "b@1.0"), part("lone@2")],
      "Machine",
    );
    expect(plan.assemblies).toEqual([
      { name: "Machine", parent: undefined, components: [2], path: undefined },
      { name: "F", parent: 0, components: [0], path: [0] },
      { name: "G", parent: 0, components: [1], path: [1] },
    ]);
    expect(plan.links).toEqual([
      { parent: 2, child: 0 },
      { parent: 2, child: 1 },
    ]);
  });
});

describe("planStepTree edge cases", () => {
  it("names a single part's assembly after the part, and components without a chain after the file", () => {
    expect(planStepTree([part("only@0")], "File").assemblies).toEqual([
      { name: "only", parent: undefined, components: [0], path: [0] },
    ]);
    expect(planStepTree([{ nodes: [] }], "File").assemblies).toEqual([
      { name: "File", parent: undefined, components: [0], path: undefined },
    ]);
    expect(planStepTree([{ nodes: [] }, { nodes: [] }], "File").links).toEqual([
      { parent: 0, child: 1 },
    ]);
  });

  it("nests down to depth 4 and tells apart nodes with the same name by path", () => {
    const plan = planStepTree(
      [
        part("R@0", "L1@0.0", "L2@0.0.0", "L3@0.0.0.0", "deep@0.0.0.0.0"),
        part("R@0", "L1@0.1", "x@0.1.0"),
      ],
      "file",
    );
    expect(plan.assemblies.map(({ name, parent }) => [name, parent])).toEqual([
      ["R", undefined],
      ["L1", 0],
      ["L2", 1],
      ["L3", 2],
      ["L1", 0],
    ]);
    expect(plan.links).toEqual([{ parent: 0, child: 1 }]);
  });
});

// The result must be a valid document: anchors a forest, keys unique.
function build(components: ChainComponent[]) {
  const empty = PantinDocumentSchema.parse({
    schema_version: PANTIN_SCHEMA_VERSION,
    name: "T",
    assemblies: [
      { key: "m", name: "M", placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] } },
    ],
    bodies: [],
    joints: [],
    drives: [],
    actuators: [],
    sensors: [],
    belts: [],
    guides: [],
    emitters: [],
    absorbers: [],
    presenceSensors: [],
  });
  const plan = planStepTree(components, "M");
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
  return { assemblies, ...addFixedJoints(withAll, links) };
}

describe("an imported tree as a document", () => {
  it("parses, with keys unique against existing assemblies and parents set", () => {
    const { assemblies, document, joints } = build([
      part("M@0", "A@0.0", "a1@0.0.0"),
      part("M@0", "A@0.0", "a2@0.0.1"),
      part("M@0", "B@0.1", "b1@0.1.0"),
      part("M@0", "B@0.1", "B@0.1.1", "deep@0.1.1.0"),
    ]);
    expect(PantinDocumentSchema.safeParse(document).success).toBe(true);
    expect(assemblies.map((assembly) => assembly.key)).toEqual(["m-2", "a", "b", "b-2"]);
    expect(assemblies.map((assembly) => assembly.parent)).toEqual([undefined, "m-2", "m-2", "b"]);
    // One joint per child assembly: B hangs from A (the handle of M is a1), "b-2" from B.
    expect(joints.map(({ parent, child }) => [parent, child])).toEqual([
      [groupEndpoint("a"), groupEndpoint("b")],
      [groupEndpoint("b"), groupEndpoint("b-2")],
    ]);
  });
});
