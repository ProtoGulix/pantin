import {
  type PantinDocument,
  type Placement,
  PRESENCE_SENSOR_PARAMETERS,
  type PresenceSensorType,
} from "@pantin/protocol";
import { PLACEMENT_FIELDS, placementToFields } from "../placement-units.ts";
import {
  parameterKeys,
  parameterTexts,
  defaultTexts as presenceDefaultTexts,
} from "../sensors/parameter-texts.ts";
import { formatDisplayNumber, metresToMillimetres } from "../units.ts";
import { DRUM_JOINT_KEY, defaultTexts, MATERIAL_KEY, SIZE_KEYS } from "./conveyor-fields.ts";
import { type ConveyorItems, type ConveyorKind, findConveyor } from "./conveyor-kinds.ts";

// The form of a belt, guide, emitter, absorber or presence sensor (ADR 0043
// point 13) as pure functions. The user types millimetres, degrees and
// kilograms; the request is built in SI and validated by the protocol's schema
// before anything is sent. A presence sensor's inputs come from its type's
// parameter list, as a joint sensor's do (sensors/sensor-form.ts).

export interface ConveyorFormState {
  kind: ConveyorKind;
  // The object this form replaces, or null when it creates one.
  id: string | null;
  name: string;
  assembly: string;
  // The body whose frame the object follows; "" for the assembly's own frame.
  body: string;
  // Only a presence sensor has a type.
  presenceType: PresenceSensorType;
  // Raw text of every input, by key, unvalidated; a flag is "true" or "false".
  values: Readonly<Record<string, string>>;
}

export const PRESENCE_TYPES: readonly PresenceSensorType[] = Object.keys(
  PRESENCE_SENSOR_PARAMETERS,
).filter((type): type is PresenceSensorType => type in PRESENCE_SENSOR_PARAMETERS);

const FIRST_PRESENCE_TYPE: PresenceSensorType = PRESENCE_TYPES[0] ?? "photoelectric";

// What a new cell starts with, besides the type's own defaults (a choice on its first option).
const PRESENCE_DEFAULT_TEXTS: Readonly<Record<string, string>> = {
  range: "300",
  onDelay: "0",
  offDelay: "0",
};

export function parsePresenceType(raw: string): PresenceSensorType | null {
  return PRESENCE_TYPES.find((type) => type === raw) ?? null;
}

function presenceDefaults(type: PresenceSensorType): Record<string, string> {
  return Object.assign(
    {},
    ...PRESENCE_SENSOR_PARAMETERS[type].map(presenceDefaultTexts),
    PRESENCE_DEFAULT_TEXTS,
  );
}

/** The bodies a picker offers for an assembly: those of that assembly only. */
export function bodiesOfAssembly(document: PantinDocument, assembly: string) {
  return document.bodies.filter((body) => body.assembly === assembly);
}

export function initialConveyorForm(kind: ConveyorKind, document: PantinDocument) {
  const form: ConveyorFormState = {
    kind,
    id: null,
    name: "",
    assembly: document.assemblies[0]?.key ?? "",
    body: "",
    presenceType: FIRST_PRESENCE_TYPE,
    values: {
      ...defaultTexts(kind, document),
      ...(kind === "presenceSensor" ? presenceDefaults(FIRST_PRESENCE_TYPE) : {}),
    },
  };
  return form;
}

function placementTexts(placement: Placement): Record<string, string> {
  const fields = placementToFields(placement);
  return Object.fromEntries(
    PLACEMENT_FIELDS.map((field) => [field, formatDisplayNumber(fields[field])]),
  );
}

function millimetreText(metres: number): string {
  return formatDisplayNumber(metresToMillimetres(metres));
}

function sizeTexts(size: readonly number[]): Record<string, string> {
  return Object.fromEntries(SIZE_KEYS.map((key, index) => [key, millimetreText(size[index] ?? 0)]));
}

function presenceTexts(sensor: ConveyorItems["presenceSensor"]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const parameter of PRESENCE_SENSOR_PARAMETERS[sensor.type]) {
    const texts = parameterTexts(parameter, Reflect.get(sensor, parameter.field), null);
    for (const [index, key] of parameterKeys(parameter).entries()) {
      values[key] = texts[index] ?? "";
    }
  }
  return values;
}

// One reader per kind; the mapped type ties each kind to its own item.
const OWN_TEXTS: { [Kind in ConveyorKind]: (item: ConveyorItems[Kind]) => Record<string, string> } =
  {
    belt: (belt) => ({
      length: millimetreText(belt.length),
      width: millimetreText(belt.width),
      drumRadius: millimetreText(belt.drumRadius),
      [DRUM_JOINT_KEY]: belt.drumJoint,
    }),
    guide: (guide) => sizeTexts(guide.size),
    emitter: (emitter) => ({
      ...sizeTexts(emitter.box.size),
      mass: formatDisplayNumber(emitter.box.mass),
      [MATERIAL_KEY]: emitter.box.material,
    }),
    absorber: (absorber) => sizeTexts(absorber.size),
    presenceSensor: presenceTexts,
  };

function conveyorFormFor<Kind extends ConveyorKind>(
  kind: Kind,
  item: ConveyorItems[Kind],
): ConveyorFormState {
  return {
    kind,
    id: item.id,
    name: item.name,
    assembly: item.assembly,
    body: item.body ?? "",
    presenceType: "type" in item ? item.type : FIRST_PRESENCE_TYPE,
    values: { ...placementTexts(item.placement), ...OWN_TEXTS[kind](item) },
  };
}

/** The form of a stored object, or null when the document has no such object. */
export function conveyorFormOf(
  document: PantinDocument,
  kind: ConveyorKind,
  id: string,
): ConveyorFormState | null {
  // One case per kind: the item's type follows the kind only when it is spelled out.
  switch (kind) {
    case "belt": {
      const belt = findConveyor(document, "belt", id);
      return belt === undefined ? null : conveyorFormFor("belt", belt);
    }
    case "guide": {
      const guide = findConveyor(document, "guide", id);
      return guide === undefined ? null : conveyorFormFor("guide", guide);
    }
    case "emitter": {
      const emitter = findConveyor(document, "emitter", id);
      return emitter === undefined ? null : conveyorFormFor("emitter", emitter);
    }
    case "absorber": {
      const absorber = findConveyor(document, "absorber", id);
      return absorber === undefined ? null : conveyorFormFor("absorber", absorber);
    }
    case "presenceSensor": {
      const sensor = findConveyor(document, "presenceSensor", id);
      return sensor === undefined ? null : conveyorFormFor("presenceSensor", sensor);
    }
  }
}

/** Another type has other parameters: they start at their defaults. */
export function withConveyorFormType(
  form: ConveyorFormState,
  presenceType: PresenceSensorType,
): ConveyorFormState {
  const placement = Object.fromEntries(
    PLACEMENT_FIELDS.map((field) => [field, form.values[field] ?? ""]),
  );
  return { ...form, presenceType, values: { ...placement, ...presenceDefaults(presenceType) } };
}

/** The new assembly's bodies only: a body of the old one is dropped. */
export function withConveyorFormAssembly(
  form: ConveyorFormState,
  assembly: string,
  document: PantinDocument,
): ConveyorFormState {
  const keepsBody = bodiesOfAssembly(document, assembly).some((body) => body.id === form.body);
  return { ...form, assembly, body: keepsBody ? form.body : "" };
}

/** The name, or one input by key: the one entry for the form and for an edit in the grid. */
export function withConveyorFormField(
  form: ConveyorFormState,
  fieldId: string,
  text: string,
): ConveyorFormState {
  return fieldId === "name"
    ? { ...form, name: text }
    : { ...form, values: { ...form.values, [fieldId]: text } };
}
