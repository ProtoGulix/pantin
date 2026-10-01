import { ACTUATOR_LABELS } from "@pantin/actuator-types/labels";
import { DRIVE_LABELS } from "@pantin/drive-types/labels";
import { ACTUATOR_INPUT_PORTS, ACTUATOR_PARAMETERS, type PantinDocument } from "@pantin/protocol";
import { drivesFeeding, matchingOutputPorts } from "../actuators/actuator-feed.ts";
import {
  ACTUATOR_TYPES,
  type ActuatorFormState,
  selectableJoints,
} from "../actuators/actuator-form.ts";
import { jointsCoordinateUnit } from "../actuators/actuator-joints.ts";
import { parameterUnitLabel } from "../drives/parameter-units.ts";
import type { Language, Translate } from "../i18n/translate.ts";
import type { ViewerState } from "../viewer-state.ts";

// The actuator form of the inspector (ADR 0028 point 13) as data: the type,
// the feed (the drive and its port pairs) and the joints it moves.

interface Option {
  value: string;
  label: string;
}

export interface ActuatorFormView {
  title: string;
  confirmLabel: string;
  name: string;
  type: string;
  typeOptions: Option[];
  assembly: string;
  assemblyOptions: Option[];
  // "": no feed.
  drive: string;
  driveOptions: Option[];
  // No drive of the document can feed this type: the form says to create one.
  noFittingDrive: boolean;
  ports: { name: string; label: string; value: string; options: Option[] }[];
  joints: { id: string; label: string; checked: boolean }[];
  parameters: { field: string; label: string; unit: string | null; value: string }[];
  canSubmit: boolean;
}

function portViews(form: ActuatorFormState, document: PantinDocument, language: Language) {
  const drive = document.drives.find((candidate) => candidate.id === form.driveId);
  const labels = ACTUATOR_LABELS[form.type][language];
  if (drive === undefined) {
    return [];
  }
  return ACTUATOR_INPUT_PORTS[form.type].map((port) => ({
    name: port.name,
    label: labels.ports[port.name] ?? port.name,
    value: form.ports[port.name] ?? "",
    options: matchingOutputPorts(form.type, port.name, drive.type).map((name) => ({
      value: name,
      label: name,
    })),
  }));
}

function formView(
  form: ActuatorFormState,
  state: ViewerState,
  document: PantinDocument,
  t: Translate,
) {
  const language: Language = state.language;
  const labels = ACTUATOR_LABELS[form.type][language];
  const unit = jointsCoordinateUnit(document, form.joints);
  const fitting = drivesFeeding(document, form.type);
  const view: ActuatorFormView = {
    title: t(form.actuatorId === null ? "actuators.form.title" : "actuators.form.editTitle"),
    confirmLabel: t(form.actuatorId === null ? "joint.form.confirm" : "joint.form.apply"),
    name: form.name,
    type: form.type,
    typeOptions: ACTUATOR_TYPES.map((type) => ({
      value: type,
      label: ACTUATOR_LABELS[type][language].name,
    })),
    assembly: form.assembly,
    assemblyOptions: document.assemblies.map(({ key, name }) => ({ value: key, label: name })),
    drive: form.driveId ?? "",
    driveOptions: [
      { value: "", label: t("actuators.form.noDrive") },
      ...fitting.map((drive) => ({
        value: drive.id,
        label: `${drive.name} · ${DRIVE_LABELS[drive.type][language].name}`,
      })),
    ],
    noFittingDrive: fitting.length === 0,
    ports: portViews(form, document, language),
    joints: selectableJoints(document, form).map((joint) => ({
      id: joint.id,
      label: joint.name,
      checked: form.joints.includes(joint.id),
    })),
    parameters: ACTUATOR_PARAMETERS[form.type].map((parameter) => ({
      field: parameter.field,
      label: labels.parameters[parameter.field] ?? parameter.field,
      unit: parameterUnitLabel(parameter.kind, unit, t),
      value: form.values[parameter.field] ?? "",
    })),
    canSubmit: state.pendingRequestCount === 0,
  };
  return view;
}

export function buildActuatorFormView(
  state: ViewerState,
  document: PantinDocument,
  t: Translate,
): ActuatorFormView | null {
  return state.actuatorForm === null ? null : formView(state.actuatorForm, state, document, t);
}
