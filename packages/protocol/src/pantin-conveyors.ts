import { PresenceSensorFieldsSchema } from "@pantin/sensor-types/schemas";
import { z } from "zod";
import {
  AbsorberIdSchema,
  BeltIdSchema,
  BodyIdSchema,
  DisplayNameSchema,
  EmitterIdSchema,
  GuideIdSchema,
  JointIdSchema,
  KeySchema,
  PresenceSensorIdSchema,
} from "./ids.ts";
import type { JointType } from "./joint.ts";
import { PlacementSchema } from "./placement.ts";

// Products, presence sensors and straight conveyors (ADR 0043 points 1 and 2).
// Every object is placed by an assembly, an optional body whose frame it
// follows, and a placement relative to that frame (the assembly's without a
// body). Lengths are in metres, mass in kilograms.

const frameFields = {
  assembly: KeySchema,
  body: BodyIdSchema.optional(),
  placement: PlacementSchema,
};

// `.positive()` reaches the exported JSON Schema as an exclusive minimum; zod
// already refuses NaN and infinities.
const positiveNumber = (what: string) =>
  z.number().positive(`The ${what} must be greater than zero.`);

const SizeSchema = z.tuple([
  positiveNumber("size along X"),
  positiveNumber("size along Y"),
  positiveNumber("size along Z"),
]);

// Listed here, not derived from the inductive switch, so that a metal added
// there never changes this public schema (CLAUDE.md 14.6). The metals match
// MATERIALS of the inductive switch; a test checks it.
export const PRODUCT_MATERIALS = [
  "cardboard",
  "plastic",
  "wood",
  "steel",
  "stainless_steel",
  "aluminium",
  "brass",
  "copper",
] as const;
export const ProductMaterialSchema = z.enum(PRODUCT_MATERIALS);
export type ProductMaterial = z.infer<typeof ProductMaterialSchema>;

// The belt surface is `length` along +X by `width` along Y, centred on the
// frame origin. Its surface speed is the drum's angular speed times its radius.
export const BeltSchema = z.object({
  id: BeltIdSchema,
  name: DisplayNameSchema,
  ...frameFields,
  length: positiveNumber("belt length"),
  width: positiveNumber("belt width"),
  drumJoint: JointIdSchema,
  drumRadius: positiveNumber("drum radius"),
});
export type Belt = z.infer<typeof BeltSchema>;

export const GuideSchema = z.object({
  id: GuideIdSchema,
  name: DisplayNameSchema,
  ...frameFields,
  size: SizeSchema,
});
export type Guide = z.infer<typeof GuideSchema>;

export const EmitterSchema = z.object({
  id: EmitterIdSchema,
  tagKey: KeySchema,
  name: DisplayNameSchema,
  ...frameFields,
  box: z.object({
    size: SizeSchema,
    mass: positiveNumber("box mass"),
    material: ProductMaterialSchema,
  }),
});
export type Emitter = z.infer<typeof EmitterSchema>;

export const AbsorberSchema = z.object({
  id: AbsorberIdSchema,
  name: DisplayNameSchema,
  ...frameFields,
  size: SizeSchema,
});
export type Absorber = z.infer<typeof AbsorberSchema>;

export const PresenceSensorSchema = z.intersection(
  z.object({
    id: PresenceSensorIdSchema,
    tagKey: KeySchema,
    name: DisplayNameSchema,
    ...frameFields,
  }),
  PresenceSensorFieldsSchema,
);
export type PresenceSensor = z.infer<typeof PresenceSensorSchema>;

type Framed = { id: string; assembly: string; body?: string | undefined };

type DocumentShape = {
  assemblies: readonly { key: string }[];
  bodies: readonly { id: string; assembly: string }[];
  joints: readonly { id: string; type: JointType }[];
  belts: readonly (Framed & { drumJoint: string })[];
  guides: readonly Framed[];
  emitters: readonly Framed[];
  absorbers: readonly Framed[];
  presenceSensors: readonly Framed[];
};

type ArrayName = "belts" | "guides" | "emitters" | "absorbers" | "presenceSensors";

function framedIssues(
  document: DocumentShape,
  context: z.RefinementCtx,
  list: ArrayName,
  label: string,
): void {
  const assemblies = new Set(document.assemblies.map((assembly) => assembly.key));
  const assemblyOfBody = new Map(document.bodies.map((body) => [body.id, body.assembly]));
  const report = (index: number, field: string, message: string) => {
    context.addIssue({ code: "custom", path: [list, index, field], message });
  };
  const ids = new Set<string>();
  for (const [index, item] of document[list].entries()) {
    if (ids.has(item.id)) {
      report(
        index,
        "id",
        `${label} id "${item.id}" is used twice; ${label.toLowerCase()} ids must be unique.`,
      );
    }
    ids.add(item.id);
    if (!assemblies.has(item.assembly)) {
      report(
        index,
        "assembly",
        `${label} "${item.id}" is in assembly "${item.assembly}", which does not exist.`,
      );
    }
    if (item.body === undefined) {
      continue;
    }
    const bodyAssembly = assemblyOfBody.get(item.body);
    if (bodyAssembly === undefined) {
      report(
        index,
        "body",
        `${label} "${item.id}" follows body "${item.body}", which does not exist.`,
      );
    } else if (bodyAssembly !== item.assembly) {
      report(
        index,
        "body",
        `${label} "${item.id}" follows body "${item.body}", which is in assembly "${bodyAssembly}", not "${item.assembly}". Pick a body of its assembly.`,
      );
    }
  }
}

function drumIssues(document: DocumentShape, context: z.RefinementCtx): void {
  const joints = new Map(document.joints.map((joint) => [joint.id, joint]));
  for (const [index, belt] of document.belts.entries()) {
    const drum = joints.get(belt.drumJoint);
    if (drum?.type !== "continuous") {
      context.addIssue({
        code: "custom",
        path: ["belts", index, "drumJoint"],
        message: `Belt "${belt.id}" turns on "${belt.drumJoint}", which is not a continuous joint of this Pantin.`,
      });
    }
  }
}

/** Document rules of the phase 6 objects (ADR 0043 point 2). Tag keys are checked in pantin-assemblies.ts. */
export function conveyorIssues(document: DocumentShape, context: z.RefinementCtx): void {
  framedIssues(document, context, "belts", "Belt");
  framedIssues(document, context, "guides", "Guide");
  framedIssues(document, context, "emitters", "Emitter");
  framedIssues(document, context, "absorbers", "Absorber");
  framedIssues(document, context, "presenceSensors", "Presence sensor");
  drumIssues(document, context);
}

export {
  PRESENCE_SENSOR_PARAMETERS,
  PRESENCE_SENSOR_TAGS,
  type PresenceSensorType,
} from "@pantin/sensor-types/schemas";
