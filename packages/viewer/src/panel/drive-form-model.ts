import { DRIVE_LABELS } from "@pantin/drive-types/labels";
import { DRIVE_PARAMETERS, type PantinDocument } from "@pantin/protocol";
import { driveCoordinateUnit } from "../actuators/actuator-joints.ts";
import { DRIVE_TYPES, type DriveFormState } from "../drives/drive-form.ts";
import { parameterConversionUnit, parameterUnitLabel } from "../drives/parameter-units.ts";
import type { Language, Translate } from "../i18n/translate.ts";
import type { ViewerState } from "../viewer-state.ts";

// The drive form of the inspector (ADR 0022, 0028) as data. Drive types and
// parameters come from the registries; their labels from @pantin/drive-types.

export interface DriveFormView {
  title: string;
  confirmLabel: string;
  name: string;
  type: string;
  typeOptions: { value: string; label: string }[];
  assembly: string;
  assemblyOptions: { value: string; label: string }[];
  parameters: { field: string; label: string; unit: string | null; value: string }[];
  // Says which unit the speeds are in while no joint tells it, else null.
  unitHint: string | null;
  canSubmit: boolean;
}

function formView(
  form: DriveFormState,
  state: ViewerState,
  document: PantinDocument,
  t: Translate,
) {
  const language: Language = state.language;
  const labels = DRIVE_LABELS[form.type][language];
  const unit = driveCoordinateUnit(document, form.driveId);
  // Speeds and accelerations follow the joints the drive ends up moving; until
  // an actuator it feeds moves one, they are shown in metres (a silent
  // reinterpretation when a rotary actuator is attached later).
  const followsJoints = DRIVE_PARAMETERS[form.type].some(
    (parameter) => parameterConversionUnit(parameter.kind, "metre") !== null,
  );
  const movesJoints = document.actuators.some(
    (actuator) => actuator.feed?.drive === form.driveId && actuator.joints.length > 0,
  );
  const view: DriveFormView = {
    title: t(form.driveId === null ? "drives.form.title" : "drives.form.editTitle"),
    confirmLabel: t(form.driveId === null ? "joint.form.confirm" : "joint.form.apply"),
    name: form.name,
    type: form.type,
    typeOptions: DRIVE_TYPES.map((type) => ({
      value: type,
      label: DRIVE_LABELS[type][language].name,
    })),
    assembly: form.assembly,
    assemblyOptions: document.assemblies.map(({ key, name }) => ({ value: key, label: name })),
    parameters: DRIVE_PARAMETERS[form.type].map((parameter) => ({
      field: parameter.field,
      label: labels.parameters[parameter.field] ?? parameter.field,
      unit: parameterUnitLabel(parameter.kind, unit, t),
      value: form.values[parameter.field] ?? "",
    })),
    unitHint: followsJoints && !movesJoints ? t("drives.form.unitHint") : null,
    canSubmit: state.pendingRequestCount === 0,
  };
  return view;
}

export function buildDriveFormView(
  state: ViewerState,
  document: PantinDocument,
  t: Translate,
): DriveFormView | null {
  return state.driveForm === null ? null : formView(state.driveForm, state, document, t);
}
