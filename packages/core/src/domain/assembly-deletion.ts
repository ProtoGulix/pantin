import {
  type Assembly,
  type AssemblyDeletion,
  type Joint,
  type PantinDocument,
  PantinDocumentSchema,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { deriveAssemblyAnchors } from "./assembly-anchors.ts";
import { type AssemblyContents, contentsOfAssembly, findAssembly } from "./assembly-contents.ts";
import { keepDisplayedPose } from "./keep-displayed-pose.ts";
import { vanishedAndAppearedTags } from "./tags.ts";
import { parseWithSchema } from "./validation.ts";

// Deleting an assembly with its contents (ADR 0037), as a pure function: the
// assembly's bodies, drives, actuators and sensors go, and every joint that
// touches one of its bodies. Other assemblies keep everything they own, or the
// deletion is refused.

export type AssemblyDeletionResult = {
  document: PantinDocument;
  deletion: AssemblyDeletion;
  // Mesh files of removed bodies that no remaining body uses.
  meshPaths: string[];
};

const FIX_ACTUATOR = "Remove the joint from the actuator, or delete the actuator, first.";
const FIX_FEED = "Remove the feed from the actuator, or delete the actuator, first.";
const FIX_SENSOR = "Point the sensor at another joint, or delete it, first.";

// Items of other assemblies that cannot stay as they are (ADR 0037 point 3).
function blockingItems(document: PantinDocument, key: string, contents: AssemblyContents) {
  const assemblyName = (assemblyKey: string) =>
    document.assemblies.find((assembly) => assembly.key === assemblyKey)?.name ?? assemblyKey;
  const removedJoints = new Map(contents.joints.map((joint) => [joint.id, joint]));
  const removedDriveIds = new Set(contents.drives.map(({ id }) => id));
  const blocks: string[] = [];
  for (const actuator of document.actuators.filter((item) => item.assembly !== key)) {
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
  for (const sensor of document.sensors.filter((item) => item.assembly !== key)) {
    const joint = removedJoints.get(sensor.joint);
    if (joint !== undefined) {
      const where = `Sensor "${sensor.name}" of assembly "${assemblyName(sensor.assembly)}"`;
      blocks.push(`${where} watches joint "${joint.name}", which would be deleted. ${FIX_SENSOR}`);
    }
  }
  return blocks;
}

function documentWithout(
  document: PantinDocument,
  key: string,
  contents: AssemblyContents,
): PantinDocument {
  const bodyIds = new Set(contents.bodies.map(({ id }) => id));
  const jointIds = new Set(contents.joints.map(({ id }) => id));
  return {
    ...document,
    assemblies: document.assemblies.filter((assembly) => assembly.key !== key),
    bodies: document.bodies.filter((body) => !bodyIds.has(body.id)),
    joints: document.joints.filter((joint) => !jointIds.has(joint.id)),
    drives: document.drives.filter((drive) => drive.assembly !== key),
    actuators: document.actuators.filter((actuator) => actuator.assembly !== key),
    sensors: document.sensors.filter((sensor) => sensor.assembly !== key),
  };
}

const named = ({ id, name }: { id: string; name: string }) => ({ id, name });

function describeDeletion(
  document: PantinDocument,
  assembly: Assembly,
  contents: AssemblyContents,
  tags: { removedTags: string[]; addedTags: string[] },
): AssemblyDeletion {
  const key = assembly.key;
  const ownBodyIds = new Set(contents.bodies.map(({ id }) => id));
  const betweenAssemblies = (joint: Joint) =>
    !(ownBodyIds.has(joint.parent) && ownBodyIds.has(joint.child));
  // Anchored to the deleted assembly: now to the world (ADR 0037 point 2).
  const anchors = deriveAssemblyAnchors(document);
  const reanchored = document.assemblies.filter(
    (candidate) => anchors.get(candidate.key)?.assembly === key,
  );
  return {
    assembly: { key, name: assembly.name },
    bodies: contents.bodies.map(named),
    joints: contents.joints.map((joint) => ({
      ...named(joint),
      betweenAssemblies: betweenAssemblies(joint),
    })),
    drives: contents.drives.map(named),
    actuators: contents.actuators.map(named),
    sensors: contents.sensors.map(named),
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
  const contents = contentsOfAssembly(document, key);
  const blocks = blockingItems(document, key, contents);
  if (blocks.length > 0) {
    throw new ApiError(
      "conflict",
      `Assembly "${assembly.name}" cannot be deleted with its contents. ${blocks.join(" ")}`,
    );
  }
  const stripped = documentWithout(document, key, contents);
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
    deletion: describeDeletion(document, assembly, contents, tags),
    meshPaths,
  };
}
