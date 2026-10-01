import {
  type JointCoordinateUnit,
  type PantinDocument,
  SENSOR_PARAMETERS,
  type SensorParameter,
} from "@pantin/protocol";
import { SENSOR_LABELS } from "@pantin/sensor-types/labels";
import { movableJoints } from "../actuators/actuator-joints.ts";
import type { Language, Translate } from "../i18n/translate.ts";
import { displayUnitLabel, strokeOf } from "../joints/joint-parameters.ts";
import { parameterKeys } from "../sensors/parameter-texts.ts";
import {
  SENSOR_TYPES,
  type SensorFormState,
  sensorCoordinateUnit,
  sensorFieldsOf,
} from "../sensors/sensor-form.ts";
import {
  buildSwitchDiagramModel,
  type SwitchDiagramModel,
} from "../sensors/switch-diagram-model.ts";
import { displayUnitOf } from "../units.ts";
import type { ViewerState } from "../viewer-state.ts";

// The sensor form of the inspector (ADR 0023) as data. Types and parameters
// come from the registries, their labels from @pantin/sensor-types.

interface SensorInputView {
  key: string;
  label: string;
  input: "text" | "checkbox" | "select";
  // The values a select offers, labelled.
  options: { value: string; label: string }[];
  value: string;
}

const INPUTS: Readonly<Record<SensorParameter["kind"], SensorInputView["input"]>> = {
  coordinateRange: "text",
  coordinate: "text",
  pulsesPerUnit: "text",
  percent: "text",
  choice: "select",
  flag: "checkbox",
};

export interface SensorFormView {
  title: string;
  confirmLabel: string;
  name: string;
  type: string;
  typeOptions: { value: string; label: string }[];
  assembly: string;
  assemblyOptions: { value: string; label: string }[];
  joint: string;
  jointOptions: { value: string; label: string }[];
  inputs: SensorInputView[];
  // The switch's dimensioned diagram (ADR 0026); null for another type or while a field does not parse.
  diagram: SwitchDiagramModel | null;
  canSubmit: boolean;
}

// "Range, min (mm)", "Resolution (pulses/mm)", "Hysteresis (%)", "Normally closed".
function inputLabels(
  parameter: SensorParameter,
  label: string,
  unit: JointCoordinateUnit,
  t: Translate,
) {
  const display = displayUnitOf(unit);
  const base = display === null ? null : displayUnitLabel(display, t);
  const withUnit = (text: string, unitText: string | null) =>
    unitText === null ? text : `${text} (${unitText})`;
  switch (parameter.kind) {
    case "flag":
    case "choice":
      return [label];
    case "percent":
      return [withUnit(label, "%")];
    case "coordinate":
      return [withUnit(label, base)];
    case "pulsesPerUnit":
      return [withUnit(label, base === null ? null : `${t("sensors.pulses")}/${base}`)];
    case "coordinateRange":
      return [t("properties.part.lower"), t("properties.part.upper")].map((part) =>
        withUnit(`${label}, ${part}`, base),
      );
  }
}

export function sensorFormInputs(
  form: SensorFormState,
  language: Language,
  document: PantinDocument,
  t: Translate,
) {
  const labels = SENSOR_LABELS[form.type][language];
  const unit = sensorCoordinateUnit(document, form.joint);
  return SENSOR_PARAMETERS[form.type].flatMap((parameter) => {
    const texts = inputLabels(
      parameter,
      labels.parameters[parameter.field] ?? parameter.field,
      unit,
      t,
    );
    const options = (parameter.options ?? []).map((value) => ({
      value,
      label: labels.options?.[value] ?? value,
    }));
    return parameterKeys(parameter).map((key, index) => ({
      key,
      label: texts[index] ?? key,
      input: INPUTS[parameter.kind],
      options,
      value: form.values[key] ?? "",
    }));
  });
}

function formDiagram(
  form: SensorFormState,
  state: ViewerState,
  document: PantinDocument,
  t: Translate,
) {
  const joint = document.joints.find((candidate) => candidate.id === form.joint);
  const unit = sensorCoordinateUnit(document, form.joint);
  const display = displayUnitOf(unit);
  const fields = sensorFieldsOf(form, unit);
  if (joint === undefined || display === null || fields === null) {
    return null;
  }
  return buildSwitchDiagramModel({
    fields,
    stroke: strokeOf(joint),
    labels: SENSOR_LABELS[form.type][state.language],
    unit,
    unitSymbol: displayUnitLabel(display, t),
  });
}

function formView(
  form: SensorFormState,
  state: ViewerState,
  document: PantinDocument,
  t: Translate,
) {
  const view: SensorFormView = {
    title: t(form.sensorId === null ? "sensors.form.title" : "sensors.form.editTitle"),
    confirmLabel: t(form.sensorId === null ? "joint.form.confirm" : "joint.form.apply"),
    name: form.name,
    type: form.type,
    typeOptions: SENSOR_TYPES.map((type) => ({
      value: type,
      label: SENSOR_LABELS[type][state.language].name,
    })),
    assembly: form.assembly,
    assemblyOptions: document.assemblies.map(({ key, name }) => ({ value: key, label: name })),
    joint: form.joint,
    jointOptions: movableJoints(document).map(({ id, name }) => ({ value: id, label: name })),
    inputs: sensorFormInputs(form, state.language, document, t),
    diagram: formDiagram(form, state, document, t),
    canSubmit: state.pendingRequestCount === 0,
  };
  return view;
}

export function buildSensorFormView(
  state: ViewerState,
  document: PantinDocument,
  t: Translate,
): SensorFormView | null {
  return state.sensorForm === null ? null : formView(state.sensorForm, state, document, t);
}
