import {
  type Body,
  PANTIN_SCHEMA_VERSION,
  type PantinDocument,
  PantinDocumentSchema,
  type SourceNode,
} from "@pantin/protocol";
import { newAssemblyTree } from "../domain/assemblies.ts";
import {
  type AssemblyLocation,
  applyImportFrames,
  planImportFrames,
} from "../domain/assembly-frames.ts";
import { addFixedJoints } from "../domain/import-joints.ts";
import { addAssembly, addBodies } from "../domain/pantin-document.ts";
import { axisAngleRotation } from "../domain/rigid-transform.ts";
import { type ChainComponent, planStepTree } from "../domain/step-assembly-tree.ts";

// A STEP import without the HTTP layer: the plan, the assemblies, the bodies,
// the joints and the frames, as import-operations.ts runs them.

export function part(...chain: string[]): ChainComponent {
  const nodes: SourceNode[] = chain.map((link) => {
    const [name = "", path = ""] = link.split("@");
    return { name, path: path === "" ? [] : path.split(".").map(Number) };
  });
  return { nodes };
}

export const QUARTER_TURN = axisAngleRotation([0, 0, 1], Math.PI / 2);
export const NO_LOCATIONS: AssemblyLocation[] = [];

export function importDocument(components: ChainComponent[], locations: AssemblyLocation[]) {
  const empty: PantinDocument = PantinDocumentSchema.parse({
    schema_version: PANTIN_SCHEMA_VERSION,
    name: "T",
    assemblies: [],
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

export const MACHINE = [
  part("M@0", "plate@0.0"),
  part("M@0", "Sub@0.1", "a@0.1.0"),
  part("M@0", "Sub@0.1", "b@0.1.1"),
];
export const SUB_LOCATION: AssemblyLocation = {
  path: [0, 1],
  translation: [1, 2, 0],
  rotation: [...QUARTER_TURN],
};
export const MACHINE_LOCATIONS: AssemblyLocation[] = [
  { path: [0], translation: [0.5, 0, 0], rotation: [0, 0, 0, 1] },
  SUB_LOCATION,
];
