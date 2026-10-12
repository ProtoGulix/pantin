import {
  type Assembly,
  type AssemblyDeletion,
  type Joint,
  type PantinDocument,
  PantinDocumentSchema,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { deriveAssemblyAnchors } from "./assembly-anchors.ts";
import {
  type AssemblyContents,
  contentsOfAssemblies,
  descendantAssemblies,
  findAssembly,
} from "./assembly-contents.ts";
import { keepDisplayedPose } from "./keep-displayed-pose.ts";
import { vanishedAndAppearedTags } from "./tags.ts";
import { parseWithSchema } from "./validation.ts";

// Deleting an assembly with its contents (ADR 0037), as a pure function: the
// assembly and its sub-assemblies (ADR 0040 point 8) are taken as one; their
// bodies, drives, actuators, sensors and phase 6 objects go, and every
// joint that touches one of its bodies. Other assemblies keep everything they own, or the
// deletion is refused.

export type AssemblyDeletionResult = {
  document: PantinDocument;
  deletion: AssemblyDeletion;
  // Mesh files of removed bodies that no remaining body uses.
  meshPaths: string[];
};

const FIX_ACTUATOR = "Remove the joint from the actuator, or delete the actuator, first.";
const FIX_FEED = "Remove the feed from the actuator, or delete the actuator, first.";
const FIX_FRAME = "Detach it from the body, or delete it, first.";
const FIX_DRUM = "Point the belt at another continuous joint, or delete it, first.";
const FIX_SENSOR = "Point the sensor at another joint, or delete it, first.";

// Items of other assemblies that cannot stay as they are (ADR 0037 point 3).
function blockingItems(
  document: PantinDocument,
  keys: ReadonlySet<string>,
  contents: AssemblyContents,
) {
  const assemblyName = (assemblyKey: string) =>
    document.assemblies.find((assembly) => assembly.key === assemblyKey)?.name ?? assemblyKey;
  const removedJoints = new Map(contents.joints.map((joint) => [joint.id, joint]));
  const removedDriveIds = new Set(contents.drives.map(({ id }) => id));
  const blocks: string[] = [];
  for (const actuator of document.actuators.filter((item) => !keys.has(item.assembly))) {
    const where = `Actuator "${actuator.name}" of assembly "${assemblyName(actuator.assembly)}"`;
    for (const jointId of actuator.joints) {
      const joint = removedJoints.get(jointId);
      if (joint !== undefined) {
        blocks.push(
          `${where} moves joint "${joint.name}", which would be deleted. ${FIX_ACTUATOR}`,
        );
      }
    }
    if (actuator.feed !== undefined && removedDriveIds.has(actuator.feed.drive)) {
      const driveId = actuator.feed.drive;
      const driveName = contents.drives.find(({ id }) => id === driveId)?.name ?? driveId;
      blocks.push(`${where} is fed by drive "${driveName}", which would be deleted. ${FIX_FEED}`);
    }
  }
  for (const sensor of document.sensors.filter((item) => !keys.has(item.assembly))) {
    const joint = removedJoints.get(sensor.joint);
    if (joint !== undefined) {
      const where = `Sensor "${sensor.name}" of assembly "${assemblyName(sensor.assembly)}"`;
      blocks.push(`${where} watches joint "${joint.name}", which would be deleted. ${FIX_SENSOR}`);
    }
  }
  return [...blocks, ...blockingPhase6Objects(document, keys, contents)];
}

// Belts, guides, emitters, absorbers and presence sensors of other assemblies
// that follow a removed body, or whose belt turns on a removed drum joint.
function blockingPhase6Objects(
  document: PantinDocument,
  keys: ReadonlySet<string>,
  contents: AssemblyContents,
): string[] {
  const removedBodyIds = new Set(contents.bodies.map(({ id }) => id));
  const removedJointIds = new Set(contents.joints.map(({ id }) => id));
  const others = [
    ["Belt", document.belts],
    ["Guide", document.guides],
    ["Emitter", document.emitters],
    ["Absorber", document.absorbers],
    ["Presence sensor", document.presenceSensors],
  ] as const;
  const blocks: string[] = [];
  for (const [label, items] of others) {
    for (const item of items.filter(({ assembly }) => !keys.has(assembly))) {
      if (item.body !== undefined && removedBodyIds.has(item.body)) {
        blocks.push(
          `${label} "${item.name}" follows body "${item.body}", which would be deleted. ${FIX_FRAME}`,
        );
      }
    }
  }
  for (const belt of document.belts.filter(({ assembly }) => !keys.has(assembly))) {
    if (removedJointIds.has(belt.drumJoint)) {
      blocks.push(
        `Belt "${belt.name}" turns on joint "${belt.drumJoint}", which would be deleted. ${FIX_DRUM}`,
      );
    }
  }
  return blocks;
}

function documentWithout(
  document: PantinDocument,
  keys: ReadonlySet<string>,
  contents: AssemblyContents,
): PantinDocument {
  const bodyIds = new Set(contents.bodies.map(({ id }) => id));
  const jointIds = new Set(contents.joints.map(({ id }) => id));
  return {
    ...document,
    assemblies: document.assemblies.filter((assembly) => !keys.has(assembly.key)),
    bodies: document.bodies.filter((body) => !bodyIds.has(body.id)),
    joints: document.joints.filter((joint) => !jointIds.has(joint.id)),
    drives: document.drives.filter((drive) => !keys.has(drive.assembly)),
    actuators: document.actuators.filter((actuator) => !keys.has(actuator.assembly)),
    sensors: document.sensors.filter((sensor) => !keys.has(sensor.assembly)),
    belts: document.belts.filter((belt) => !keys.has(belt.assembly)),
    guides: document.guides.filter((guide) => !keys.has(guide.assembly)),
    emitters: document.emitters.filter((emitter) => !keys.has(emitter.assembly)),
    absorbers: document.absorbers.filter((absorber) => !keys.has(absorber.assembly)),
    presenceSensors: document.presenceSensors.filter((sensor) => !keys.has(sensor.assembly)),
  };
}

const named = ({ id, name }: { id: string; name: string }) => ({ id, name });

function describeDeletion(
  document: PantinDocument,
  assembly: Assembly,
  descendants: readonly Assembly[],
  contents: AssemblyContents,
  tags: { removedTags: string[]; addedTags: string[] },
): AssemblyDeletion {
  const key = assembly.key;
  const keys = new Set([key, ...descendants.map((item) => item.key)]);
  const assemblyOfBody = new Map(document.bodies.map((item) => [item.id, item.assembly]));
  const betweenAssemblies = (joint: Joint) =>
    assemblyOfBody.get(joint.parent) !== assemblyOfBody.get(joint.child);
  // Outside the deleted set, anchored into it: now to the world (ADR 0037 point 2).
  const anchors = deriveAssemblyAnchors(document);
  const reanchored = document.assemblies.filter((candidate) => {
    const anchor = anchors.get(candidate.key)?.assembly;
    return !keys.has(candidate.key) && anchor !== undefined && keys.has(anchor);
  });
  return {
    assembly: { key, name: assembly.name },
    descendantAssemblies: descendants.map(({ key: subKey, name }) => ({ key: subKey, name })),
    bodies: contents.bodies.map(named),
    joints: contents.joints.map((joint) => ({
      ...named(joint),
      betweenAssemblies: betweenAssemblies(joint),
    })),
    drives: contents.drives.map(named),
    actuators: contents.actuators.map(named),
    sensors: contents.sensors.map(named),
    belts: contents.belts.map(named),
    guides: contents.guides.map(named),
    emitters: contents.emitters.map(named),
    absorbers: contents.absorbers.map(named),
    presenceSensors: contents.presenceSensors.map(named),
    reanchoredAssemblies: reanchored.map(({ key: anchoredKey, name }) => ({
      key: anchoredKey,
      name,
    })),
    ...tags,
  };
}

export function deleteAssemblyWithContents(
  document: PantinDocument,
  key: string,
  positions: ReadonlyMap<string, number>,
): AssemblyDeletionResult {
  const assembly = findAssembly(document, key);
  const descendants = descendantAssemblies(document, key);
  const keys = new Set([key, ...descendants.map((item) => item.key)]);
  const contents = contentsOfAssemblies(document, keys);
  const blocks = blockingItems(document, keys, contents);
  if (blocks.length > 0) {
    throw new ApiError(
      "conflict",
      `Assembly "${assembly.name}" cannot be deleted with its contents. ${blocks.join(" ")}`,
    );
  }
  const stripped = documentWithout(document, keys, contents);
  const after = parseWithSchema(
    PantinDocumentSchema,
    keepDisplayedPose(document, stripped, positions),
    "The Pantin without the assembly",
  );
  const stillUsed = new Set(after.bodies.map((body) => body.mesh));
  const meshPaths = [...new Set(contents.bodies.map((body) => body.mesh))].filter(
    (meshPath) => !stillUsed.has(meshPath),
  );
  const tags = vanishedAndAppearedTags(document, after);
  return {
    document: after,
    deletion: describeDeletion(document, assembly, descendants, contents, tags),
    meshPaths,
  };
}
