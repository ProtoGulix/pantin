import { z } from "zod";
import { ActuatorSchema } from "./actuator.ts";
import { DriveSchema } from "./drive.ts";
import { BodyIdSchema, DisplayNameSchema, KeySchema } from "./ids.ts";
import { JointSchema } from "./joint.ts";
import { actuatorIssues } from "./pantin-actuators.ts";
import { assemblyIssues } from "./pantin-assemblies.ts";
import { driveIssues } from "./pantin-drives.ts";
import { sensorIssues } from "./pantin-sensors.ts";
import { PlacementSchema } from "./placement.ts";
import { SensorSchema } from "./sensor.ts";

// A Pantin is a folder on disk: `pantin.json` plus a `meshes/` directory.
// The folder name is the Pantin id; the display name lives in the document.

// Version 2 added `joints` (ADR 0011), version 3 the helical joint (ADR 0013),
// version 4 assemblies and tag keys (ADR 0019), version 5 drives (ADR 0022),
// version 6 joint sensors (ADR 0023), version 7 realistic switches (ADR 0025),
// version 8 switch sides deduced from the stroke (ADR 0026), version 9
// actuators apart from drives, which no longer list joints (ADR 0028), version
// 10 a placement per assembly (ADR 0033). The core migrates older documents on
// read.
export const PANTIN_SCHEMA_VERSION = 10;

export const PANTIN_DOCUMENT_FILE_NAME = "pantin.json";
export const PANTIN_MESHES_DIRECTORY_NAME = "meshes";

// Format of the file the user imported. STEP is converted by the core into one
// GLB per assembly component, so a body's mesh file is always GLB or STL: read
// the mesh format from the extension of `mesh`, not from `source.format`.
export const SourceFormatSchema = z.enum(["glb", "stl", "step"]);
export type SourceFormat = z.infer<typeof SourceFormatSchema>;

export const LengthUnitSchema = z.enum(["m", "mm", "cm", "in"]);
export type LengthUnit = z.infer<typeof LengthUnitSchema>;

// Which axis points up inside the mesh file. glTF is Y up by specification,
// but CAD exports (OpenCascade, spike 0001) often keep Z up.
export const UpAxisSchema = z.enum(["y", "z"]);
export type UpAxis = z.infer<typeof UpAxisSchema>;

// A node name found in the imported file, kept verbatim and never edited, so
// that renaming a body never loses the link with the CAD source.
export const SourceNodeSchema = z.object({
  name: z.string(),
  // Indices from the file's root to this node, to tell apart duplicate names.
  path: z.array(z.number().int().nonnegative()),
});
export type SourceNode = z.infer<typeof SourceNodeSchema>;

// A group of bodies, as in a CAD assembly or a bill of materials (ADR 0019).
// Its key prefixes the tags of the joints whose child body it holds, and
// changes only when explicitly renamed. Its placement is a rigid transform
// from the frame of its files to the frame of its anchor, which is the world
// or the assembly of the parent body of the joint between assemblies that
// reaches it. The anchor is derived from the joints, never stored (ADR 0033).
export const AssemblySchema = z.object({
  key: KeySchema,
  name: DisplayNameSchema,
  placement: PlacementSchema,
});
export type Assembly = z.infer<typeof AssemblySchema>;

export const BodySchema = z.object({
  id: BodyIdSchema,
  name: DisplayNameSchema,
  // Key of the assembly holding the body: every body is in exactly one.
  assembly: KeySchema,
  source: z.object({
    fileName: z.string().min(1),
    format: SourceFormatSchema,
    unit: LengthUnitSchema,
    upAxis: UpAxisSchema,
    nodes: z.array(SourceNodeSchema),
  }),
  // Path relative to the Pantin folder, e.g. "meshes/rail.glb"; ends in .glb or .stl.
  mesh: z.string().min(1),
  // Relative to the assembly frame; absent means identity. Only the core
  // writes it, when a body changes assembly (ADR 0033 point 7).
  placement: PlacementSchema.optional(),
});
export type Body = z.infer<typeof BodySchema>;

function duplicateIdIssues(
  items: readonly { id: string }[],
  label: string,
  context: z.RefinementCtx,
) {
  const seenIds = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (seenIds.has(item.id)) {
      context.addIssue({
        code: "custom",
        path: [index, "id"],
        message: `${label} id "${item.id}" is used twice; ${label.toLowerCase()} ids must be unique.`,
      });
    }
    seenIds.add(item.id);
  }
}

export const PantinDocumentSchema = z
  .object({
    schema_version: z.literal(PANTIN_SCHEMA_VERSION),
    name: DisplayNameSchema,
    assemblies: z.array(AssemblySchema),
    // Body ids name mesh files, so a duplicate would silently share one file.
    bodies: z.array(BodySchema).superRefine((bodies, context) => {
      duplicateIdIssues(bodies, "Body", context);
    }),
    joints: z.array(JointSchema).superRefine((joints, context) => {
      duplicateIdIssues(joints, "Joint", context);
    }),
    drives: z.array(DriveSchema),
    actuators: z.array(ActuatorSchema),
    sensors: z.array(SensorSchema),
  })
  .superRefine((document, context) => {
    jointTreeIssues(document, context);
    assemblyIssues(document, context);
    driveIssues(document, context);
    actuatorIssues(document, context);
    sensorIssues(document, context);
  });
export type PantinDocument = z.infer<typeof PantinDocumentSchema>;

// Joints must form a forest of bodies: known bodies, no self link, at most
// one parent joint per body, no cycle. Otherwise the pose is undefined.
function jointTreeIssues(
  document: {
    bodies: readonly { id: string }[];
    joints: readonly { parent: string; child: string }[];
  },
  context: z.RefinementCtx,
): void {
  const bodyIds = new Set(document.bodies.map((body) => body.id));
  const parentOf = new Map<string, string>();
  for (const [index, joint] of document.joints.entries()) {
    const issue = jointLinkIssue(joint, bodyIds, parentOf);
    if (issue !== undefined) {
      context.addIssue({ code: "custom", path: ["joints", index], message: issue });
    }
    parentOf.set(joint.child, joint.parent);
  }
  for (const bodyId of parentOf.keys()) {
    if (hasCycleFrom(bodyId, parentOf)) {
      context.addIssue({
        code: "custom",
        path: ["joints"],
        message: `The joints form a cycle through body "${bodyId}".`,
      });
      return;
    }
  }
}

function jointLinkIssue(
  joint: { parent: string; child: string },
  bodyIds: ReadonlySet<string>,
  parentOf: ReadonlyMap<string, string>,
): string | undefined {
  if (!bodyIds.has(joint.parent) || !bodyIds.has(joint.child)) {
    return `Joint between "${joint.parent}" and "${joint.child}" references an unknown body.`;
  }
  if (joint.parent === joint.child) {
    return `A joint cannot link body "${joint.child}" to itself.`;
  }
  if (parentOf.has(joint.child)) {
    return `Body "${joint.child}" already has a parent joint; a body has at most one.`;
  }
  return undefined;
}

function hasCycleFrom(start: string, parentOf: ReadonlyMap<string, string>): boolean {
  const visited = new Set<string>();
  let current: string | undefined = start;
  while (current !== undefined) {
    if (visited.has(current)) {
      return true;
    }
    visited.add(current);
    current = parentOf.get(current);
  }
  return false;
}
