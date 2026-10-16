import {
  type CreateAbsorberRequest,
  CreateAbsorberRequestSchema,
  type CreateBeltRequest,
  CreateBeltRequestSchema,
  type CreateEmitterRequest,
  CreateEmitterRequestSchema,
  type CreateGuideRequest,
  CreateGuideRequestSchema,
  type CreatePresenceSensorRequest,
  CreatePresenceSensorRequestSchema,
  type Placement,
  PRESENCE_SENSOR_PARAMETERS,
} from "@pantin/protocol";
import { parseNumber, schemaMessage } from "../joints/joint-form.ts";
import { fieldsToPlacement, PLACEMENT_FIELDS } from "../placement-units.ts";
import { parameterValue } from "../sensors/parameter-texts.ts";
import { millimetresToMetres } from "../units.ts";
import { DRUM_JOINT_KEY, MATERIAL_KEY, SIZE_KEYS } from "./conveyor-fields.ts";
import type { ConveyorFormState } from "./conveyor-form.ts";

// The request a conveyor form sends (ADR 0043 point 12): the typed texts in SI,
// validated by the protocol's schema of the kind before anything is sent.

function numberOf(form: ConveyorFormState, key: string): number {
  return parseNumber(form.values[key]);
}

function lengthOf(form: ConveyorFormState, key: string): number {
  return millimetresToMetres(numberOf(form, key));
}

function placementOf(form: ConveyorFormState): Placement {
  const [x, y, z, rx, ry, rz] = PLACEMENT_FIELDS.map((field) => numberOf(form, field));
  return fieldsToPlacement({
    x: x ?? Number.NaN,
    y: y ?? Number.NaN,
    z: z ?? Number.NaN,
    rx: rx ?? Number.NaN,
    ry: ry ?? Number.NaN,
    rz: rz ?? Number.NaN,
  });
}

function sizeOf(form: ConveyorFormState): number[] {
  return SIZE_KEYS.map((key) => lengthOf(form, key));
}

function presenceFields(form: ConveyorFormState) {
  return Object.fromEntries([
    ["type", form.presenceType],
    ...PRESENCE_SENSOR_PARAMETERS[form.presenceType].map((parameter) => [
      parameter.field,
      parameterValue(parameter, form.values, null),
    ]),
  ]);
}

// The fields a kind has besides the frame, in SI, unvalidated.
function ownFields(form: ConveyorFormState): Record<string, unknown> {
  switch (form.kind) {
    case "belt":
      return {
        length: lengthOf(form, "length"),
        width: lengthOf(form, "width"),
        drumRadius: lengthOf(form, "drumRadius"),
        drumJoint: form.values[DRUM_JOINT_KEY] ?? "",
      };
    case "guide":
    case "absorber":
      return { size: sizeOf(form) };
    case "emitter":
      return {
        box: {
          size: sizeOf(form),
          mass: numberOf(form, "mass"),
          material: form.values[MATERIAL_KEY] ?? "",
        },
      };
    case "presenceSensor":
      return presenceFields(form);
  }
}

export type ConveyorRequest =
  | { kind: "belt"; request: CreateBeltRequest }
  | { kind: "guide"; request: CreateGuideRequest }
  | { kind: "emitter"; request: CreateEmitterRequest }
  | { kind: "absorber"; request: CreateAbsorberRequest }
  | { kind: "presenceSensor"; request: CreatePresenceSensorRequest };

export type ConveyorRequestResult =
  | { ok: true; request: ConveyorRequest }
  // The schema's own message, in English.
  | { ok: false; message: string };

type Parsed<Request> =
  | { success: true; data: Request }
  | { success: false; error: Parameters<typeof schemaMessage>[0] };

function result<Request>(
  parsed: Parsed<Request>,
  wrap: (request: Request) => ConveyorRequest,
): ConveyorRequestResult {
  return parsed.success
    ? { ok: true, request: wrap(parsed.data) }
    : { ok: false, message: schemaMessage(parsed.error) };
}

/** The SI request, validated by the protocol before anything is sent. */
export function buildConveyorRequest(form: ConveyorFormState): ConveyorRequestResult {
  const input = {
    name: form.name,
    assembly: form.assembly,
    ...(form.body === "" ? {} : { body: form.body }),
    placement: placementOf(form),
    ...ownFields(form),
  };
  switch (form.kind) {
    case "belt":
      return result(CreateBeltRequestSchema.safeParse(input), (request) => ({
        kind: "belt",
        request,
      }));
    case "guide":
      return result(CreateGuideRequestSchema.safeParse(input), (request) => ({
        kind: "guide",
        request,
      }));
    case "emitter":
      return result(CreateEmitterRequestSchema.safeParse(input), (request) => ({
        kind: "emitter",
        request,
      }));
    case "absorber":
      return result(CreateAbsorberRequestSchema.safeParse(input), (request) => ({
        kind: "absorber",
        request,
      }));
    case "presenceSensor":
      return result(CreatePresenceSensorRequestSchema.safeParse(input), (request) => ({
        kind: "presenceSensor",
        request,
      }));
  }
}
