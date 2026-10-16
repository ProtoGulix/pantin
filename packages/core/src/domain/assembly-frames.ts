import type { Assembly, Body, PantinDocument, Placement } from "@pantin/protocol";
import {
  compose,
  IDENTITY_TRANSFORM,
  inverse,
  isIdentityTransform,
  type Quaternion,
  type RigidTransform,
  toPlacement,
  unitTransform,
  type Vector3,
} from "./rigid-transform.ts";
import type { PlannedAssembly, PlannedLink } from "./step-assembly-tree.ts";

// Frames of an import's assemblies (ADR 0040 point 4). The converter gives the
// location of every assembly node relative to its parent node; the world frame
// of a node is those locations composed along its chain, W(path) =
// W(parent path) ∘ L(path), a missing location being the identity. Pure.

export type AssemblyLocation = { path: number[]; translation: Vector3; rotation: Quaternion };

// What an import sets on one planned assembly: its own placement and the
// placement of each of its direct bodies. Undefined = identity, the default.
export type ImportFrame = { assembly: Placement | undefined; bodies: Placement | undefined };

function composeUnlessIdentity(first: RigidTransform, second: RigidTransform): RigidTransform {
  if (isIdentityTransform(first)) {
    return second;
  }
  return isIdentityTransform(second) ? first : compose(first, second);
}

function inverseUnlessIdentity(transform: RigidTransform): RigidTransform {
  return isIdentityTransform(transform) ? transform : inverse(transform);
}

// Adding 0 turns a -0 into 0, so an identity stays exactly the identity.
function plainPlacement(transform: RigidTransform): Placement {
  const { translation, rotation } = toPlacement(transform);
  return {
    translation: [translation[0] + 0, translation[1] + 0, translation[2] + 0],
    rotation: [rotation[0] + 0, rotation[1] + 0, rotation[2] + 0, rotation[3] + 0],
  };
}

function worldOfPath(
  locations: ReadonlyMap<string, RigidTransform>,
  path: readonly number[],
): RigidTransform {
  let world = IDENTITY_TRANSFORM;
  for (let length = 1; length <= path.length; length += 1) {
    const location = locations.get(path.slice(0, length).join("."));
    world = location === undefined ? world : composeUnlessIdentity(world, location);
  }
  return world;
}

// The planned assembly holding each component, by component index.
function assemblyOfComponents(plan: readonly PlannedAssembly[]): number[] {
  const owners: number[] = [];
  plan.forEach(({ components }, at) => {
    for (const component of components) {
      owners[component] = at;
    }
  });
  return owners;
}

// The anchor of each planned assembly: the assembly of the parent body of its
// incoming joint between assemblies as planned (ADR 0033 point 2). It can
// differ from the STEP parent when a parent has no direct body (ADR 0040
// point 3). Undefined: anchored to the world.
function anchorsOf(
  plan: readonly PlannedAssembly[],
  links: readonly PlannedLink[],
): (number | undefined)[] {
  const owners = assemblyOfComponents(plan);
  const anchors: (number | undefined)[] = plan.map(() => undefined);
  for (const { parent, child } of links) {
    const [parentAssembly, childAssembly] = [owners[parent], owners[child]];
    if (
      parentAssembly !== undefined &&
      childAssembly !== undefined &&
      parentAssembly !== childAssembly
    ) {
      anchors[childAssembly] = parentAssembly;
    }
  }
  return anchors;
}

// placement(X) = W(anchor(X))⁻¹ ∘ W(X), world-anchored: W(X). Every body gets
// W(X)⁻¹: the meshes are in the frame of the STEP root, and a body's pose is
// D ∘ W(assembly) ∘ B (kinematics.ts), so B = W⁻¹ leaves every mesh where the
// CAD puts it. Joint origins and axes then read in the frame of the parent
// body's assembly, which is the sub-assembly as its CAD file places it.
// Without locations every frame is the identity and nothing is set.
export function planImportFrames(
  plan: readonly PlannedAssembly[],
  links: readonly PlannedLink[],
  assemblyNodes: readonly AssemblyLocation[],
): ImportFrame[] {
  const locations = new Map(
    assemblyNodes.map(({ path, ...location }) => [path.join("."), unitTransform(location)]),
  );
  const worlds = plan.map(({ path }) =>
    path === undefined ? IDENTITY_TRANSFORM : worldOfPath(locations, path),
  );
  const anchors = anchorsOf(plan, links);
  return worlds.map((world, at) => {
    const anchor = anchors[at];
    const anchorWorld = anchor === undefined ? undefined : worlds[anchor];
    const own =
      anchorWorld === undefined
        ? world
        : composeUnlessIdentity(inverseUnlessIdentity(anchorWorld), world);
    return {
      assembly: isIdentityTransform(own) ? undefined : plainPlacement(own),
      bodies: isIdentityTransform(world) ? undefined : plainPlacement(inverse(world)),
    };
  });
}

// The assemblies and bodies of an import with their frames set (`frames[i]`
// is for `assemblies[i]`; a body takes the one of its assembly), and the
// document holding them instead of the identity ones. Called once the joints
// are in, since adding a joint between assemblies recomputes placements to keep
// the world pose (ADR 0033 point 4).
export function applyImportFrames(
  document: PantinDocument,
  assemblies: readonly Assembly[],
  bodies: readonly Body[],
  frames: readonly ImportFrame[],
): { document: PantinDocument; assemblies: Assembly[]; bodies: Body[] } {
  const frameOf = new Map(assemblies.map(({ key }, at) => [key, frames[at]]));
  const importedBodies = new Set(bodies.map(({ id }) => id));
  // The document's own entries are updated, not replaced by the objects built
  // before the joints: the joints may have touched them.
  const placedDocument: PantinDocument = {
    ...document,
    assemblies: document.assemblies.map((assembly) => {
      const placement = frameOf.get(assembly.key)?.assembly;
      return placement === undefined ? assembly : { ...assembly, placement };
    }),
    bodies: document.bodies.map((body) => {
      const placement = importedBodies.has(body.id)
        ? frameOf.get(body.assembly)?.bodies
        : undefined;
      return placement === undefined ? body : { ...body, placement };
    }),
  };
  const assemblyByKey = new Map(
    placedDocument.assemblies.map((assembly) => [assembly.key, assembly]),
  );
  const bodyById = new Map(placedDocument.bodies.map((body) => [body.id, body]));
  return {
    document: placedDocument,
    assemblies: assemblies.map((assembly) => assemblyByKey.get(assembly.key) ?? assembly),
    bodies: bodies.map((body) => bodyById.get(body.id) ?? body),
  };
}
