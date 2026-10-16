import type { PantinDocument } from "@pantin/protocol";
import type { MessageKey } from "../i18n/translate.ts";
import type { ConveyorKind } from "./conveyor-kinds.ts";

// The typed fields of the forms of belts, guides, emitters and absorbers (ADR
// 0043 point 2) as data: which inputs a kind has, their unit, their starting
// text. The presence sensor's inputs come from the sensor type registry
// instead (conveyor-form.ts). Lengths are typed in millimetres and stored in
// metres, a mass is typed and stored in kilograms.

type FieldUnit = "mm" | "kg";

export interface ConveyorField {
  key: string;
  label: MessageKey;
  // Null for a chosen value (a joint, a material).
  unit: FieldUnit | null;
}

export const SIZE_KEYS = ["sizeX", "sizeY", "sizeZ"] as const;

const SIZE_FIELDS: readonly ConveyorField[] = [
  { key: "sizeX", label: "conveyors.field.sizeX", unit: "mm" },
  { key: "sizeY", label: "conveyors.field.sizeY", unit: "mm" },
  { key: "sizeZ", label: "conveyors.field.sizeZ", unit: "mm" },
];

export const DRUM_JOINT_KEY = "drumJoint";
export const MATERIAL_KEY = "material";

// A presence sensor has no fixed field: its inputs follow its type.
export const CONVEYOR_FIELDS: Readonly<Record<ConveyorKind, readonly ConveyorField[]>> = {
  belt: [
    { key: "length", label: "conveyors.field.length", unit: "mm" },
    { key: "width", label: "conveyors.field.width", unit: "mm" },
    { key: "drumRadius", label: "conveyors.field.drumRadius", unit: "mm" },
    { key: DRUM_JOINT_KEY, label: "conveyors.field.drumJoint", unit: null },
  ],
  guide: SIZE_FIELDS,
  emitter: [
    ...SIZE_FIELDS,
    { key: "mass", label: "conveyors.field.mass", unit: "kg" },
    { key: MATERIAL_KEY, label: "conveyors.field.material", unit: null },
  ],
  absorber: SIZE_FIELDS,
  presenceSensor: [],
};

// A new object starts with a plausible size so that a click on Create gives a
// usable one; the user retypes what differs.
const DEFAULT_TEXTS: Readonly<Record<ConveyorKind, Readonly<Record<string, string>>>> = {
  belt: { length: "1000", width: "300", drumRadius: "50" },
  guide: { sizeX: "1000", sizeY: "20", sizeZ: "60" },
  emitter: { sizeX: "200", sizeY: "150", sizeZ: "100", mass: "0.5", material: "cardboard" },
  absorber: { sizeX: "200", sizeY: "300", sizeZ: "100" },
  presenceSensor: {},
};

const PLACEMENT_DEFAULT_TEXTS = { x: "0", y: "0", z: "0", rx: "0", ry: "0", rz: "0" } as const;

/** The first continuous joint of the Pantin: the drum a new belt turns on. */
function firstDrumJointId(document: PantinDocument): string {
  return document.joints.find((joint) => joint.type === "continuous")?.id ?? "";
}

export function defaultTexts(kind: ConveyorKind, document: PantinDocument): Record<string, string> {
  return {
    ...PLACEMENT_DEFAULT_TEXTS,
    ...DEFAULT_TEXTS[kind],
    ...(kind === "belt" ? { [DRUM_JOINT_KEY]: firstDrumJointId(document) } : {}),
  };
}

/** True when the Pantin has something to build this kind on (an assembly, and a drum for a belt). */
export function conveyorCreationProblem(
  document: PantinDocument,
  kind: ConveyorKind,
): "noAssembly" | "noDrumJoint" | null {
  if (document.assemblies.length === 0) {
    return "noAssembly";
  }
  return kind === "belt" && firstDrumJointId(document) === "" ? "noDrumJoint" : null;
}
