import type { PantinDocument } from "@pantin/protocol";
import {
  PRESENCE_SENSOR_PARAMETERS,
  PRODUCT_MATERIALS,
  type SensorParameter,
} from "@pantin/protocol";
import { PRESENCE_SENSOR_LABELS } from "@pantin/sensor-types/labels";
import { CONVEYOR_FIELDS, DRUM_JOINT_KEY, MATERIAL_KEY } from "../conveyors/conveyor-fields.ts";
import {
  bodiesOfAssembly,
  type ConveyorFormState,
  PRESENCE_TYPES,
} from "../conveyors/conveyor-form.ts";
import type { Language, Translate } from "../i18n/translate.ts";
import { withUnit } from "../inspector/device-fields.ts";
import { PLACEMENT_FIELDS } from "../placement-units.ts";
import { placementFieldLabel } from "../properties/placement-groups.ts";
import { parameterKeys } from "../sensors/parameter-texts.ts";
import type { ViewerState } from "../viewer-state.ts";

// The form of a belt, guide, emitter, absorber or presence sensor (ADR 0043
// point 13) as data, for the inspector. Inputs are described, not drawn: a
// type's parameters come from the registry, its labels from @pantin/sensor-types.

interface Option {
  value: string;
  label: string;
}

export interface ConveyorInputView {
  key: string;
  label: string;
  input: "text" | "checkbox" | "select";
  options: Option[];
  value: string;
}

export interface ConveyorFormView {
  title: string;
  confirmLabel: string;
  name: string;
  assembly: string;
  assemblyOptions: Option[];
  body: string;
  bodyOptions: Option[];
  // The type picker of a presence sensor; empty for any other kind.
  type: string;
  typeOptions: Option[];
  placementTitle: string;
  placementInputs: ConveyorInputView[];
  inputs: ConveyorInputView[];
  canSubmit: boolean;
}

function placementInputs(form: ConveyorFormState, t: Translate): ConveyorInputView[] {
  return PLACEMENT_FIELDS.map((field) => ({
    key: field,
    label: placementFieldLabel(field, t),
    input: "text",
    options: [],
    value: form.values[field] ?? "",
  }));
}

function jointOptions(document: PantinDocument): Option[] {
  return document.joints
    .filter((joint) => joint.type === "continuous")
    .map(({ id, name }) => ({ value: id, label: name }));
}

function ownInputs(form: ConveyorFormState, document: PantinDocument, t: Translate) {
  return CONVEYOR_FIELDS[form.kind].map((field): ConveyorInputView => {
    const options =
      field.key === DRUM_JOINT_KEY
        ? jointOptions(document)
        : field.key === MATERIAL_KEY
          ? PRODUCT_MATERIALS.map((value) => ({ value, label: t(`conveyors.material.${value}`) }))
          : [];
    return {
      key: field.key,
      label: withUnit(t(field.label), field.unit),
      input: field.unit === null ? "select" : "text",
      options,
      value: form.values[field.key] ?? "",
    };
  });
}

function parameterLabel(parameter: SensorParameter, label: string): string {
  switch (parameter.kind) {
    case "length":
      return withUnit(label, "mm");
    case "duration":
      return withUnit(label, "ms");
    default:
      return label;
  }
}

function presenceInputs(form: ConveyorFormState, language: Language): ConveyorInputView[] {
  const labels = PRESENCE_SENSOR_LABELS[form.presenceType][language];
  return PRESENCE_SENSOR_PARAMETERS[form.presenceType].flatMap((parameter) =>
    parameterKeys(parameter).map((key) => ({
      key,
      label: parameterLabel(parameter, labels.parameters[parameter.field] ?? parameter.field),
      input:
        parameter.kind === "flag" ? "checkbox" : parameter.kind === "choice" ? "select" : "text",
      options: (parameter.options ?? []).map((value) => ({
        value,
        label: labels.options?.[value] ?? value,
      })),
      value: form.values[key] ?? "",
    })),
  );
}

/** The inputs of the kind after the frame fields, with their labels and units. */
export function conveyorInputs(
  form: ConveyorFormState,
  document: PantinDocument,
  language: Language,
  t: Translate,
): ConveyorInputView[] {
  return form.kind === "presenceSensor"
    ? presenceInputs(form, language)
    : ownInputs(form, document, t);
}

export function buildConveyorFormView(
  state: ViewerState,
  document: PantinDocument,
  t: Translate,
): ConveyorFormView | null {
  const form = state.conveyorForm;
  if (form === null) {
    return null;
  }
  const kind = t(`objects.kind.${form.kind}`);
  return {
    title: t(form.id === null ? "conveyors.form.title" : "conveyors.form.editTitle", { kind }),
    confirmLabel: t(form.id === null ? "joint.form.confirm" : "joint.form.apply"),
    name: form.name,
    assembly: form.assembly,
    assemblyOptions: document.assemblies.map(({ key, name }) => ({ value: key, label: name })),
    body: form.body,
    bodyOptions: [
      { value: "", label: t("conveyors.form.noBody") },
      ...bodiesOfAssembly(document, form.assembly).map(({ id, name }) => ({
        value: id,
        label: name,
      })),
    ],
    type: form.presenceType,
    typeOptions:
      form.kind === "presenceSensor"
        ? PRESENCE_TYPES.map((type) => ({
            value: type,
            label: PRESENCE_SENSOR_LABELS[type][state.language].name,
          }))
        : [],
    placementTitle: t("conveyors.form.placement"),
    placementInputs: placementInputs(form, t),
    inputs: conveyorInputs(form, document, state.language, t),
    canSubmit: state.pendingRequestCount === 0,
  };
}
