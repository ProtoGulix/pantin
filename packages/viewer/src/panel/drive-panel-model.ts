import { DRIVE_LABELS } from "@pantin/drive-types/labels";
import {
  DRIVE_PARAMETERS,
  DRIVE_TAGS,
  type Drive,
  type DriveType,
  type JointCoordinateUnit,
  type PantinDocument,
  tagName,
} from "@pantin/protocol";
import { driveCoordinateUnit } from "../actuators/actuator-joints.ts";
import { DRIVE_TYPES, type DriveFormState } from "../drives/drive-form.ts";
import {
  parameterConversionUnit,
  parameterUnitLabel,
  quantityConversionUnit,
  quantityUnitLabel,
} from "../drives/parameter-units.ts";
import type { Language, Translate } from "../i18n/translate.ts";
import type { ViewerState } from "../viewer-state.ts";
import { type ActuatorSectionView, buildActuatorSectionView } from "./actuator-panel-model.ts";
import { buildSensorSectionView, type SensorSectionView } from "./sensor-panel-model.ts";

// The drives panel on the right (ADR 0022, 0028) as data: each drive with its
// tags, and the drive form. Drive types, parameters and tags come from the
// registries; their labels from @pantin/drive-types. Tag values are not here:
// they change at every step and are written straight into the page
// (showTagValues), like the joint sliders. Actuators and sensors have their
// own sections (actuator-panel-model.ts, sensor-panel-model.ts).

// Values arrive in SI; `coordinateUnit` says how to show them (mm or
// degrees), null for a bit or a percent.
export interface DriveTagView {
  name: string;
  label: string;
  // "bit": a switch; "float": a value to send; "feedback": read only.
  control: "bit" | "float" | "feedback";
  unit: string | null;
  coordinateUnit: JointCoordinateUnit;
}

export interface DriveCardView {
  id: string;
  name: string;
  type: DriveType;
  typeLabel: string;
  tagPrefix: string;
  unresponsive: boolean;
  tags: DriveTagView[];
}

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

export interface DrivePanelView {
  open: boolean;
  title: string;
  drivesTitle: string;
  drives: DriveCardView[];
  form: DriveFormView | null;
  // Null without a Pantin.
  actuators: ActuatorSectionView | null;
  // Sensors share the panel: they are wired to joints too (ADR 0023).
  sensors: SensorSectionView | null;
}

function driveCard(document: PantinDocument, drive: Drive, state: ViewerState, t: Translate) {
  const labels = DRIVE_LABELS[drive.type][state.language];
  const unit = driveCoordinateUnit(document, drive.id);
  const card: DriveCardView = {
    id: drive.id,
    name: drive.name,
    type: drive.type,
    typeLabel: labels.name,
    tagPrefix: `${drive.assembly}.${drive.tagKey}`,
    unresponsive: state.faults.unresponsiveDrives.includes(drive.id),
    tags: DRIVE_TAGS[drive.type].map((tag) => ({
      name: tagName(drive.assembly, drive.tagKey, tag.member),
      label: labels.tags[tag.member] ?? tag.member,
      control: tag.direction === "feedback" ? "feedback" : tag.type === "bit" ? "bit" : "float",
      unit: quantityUnitLabel(tag.quantity, unit, t),
      coordinateUnit: quantityConversionUnit(tag.quantity, unit),
    })),
  };
  return card;
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

export function buildDrivePanelView(state: ViewerState, t: Translate): DrivePanelView {
  const document = state.openPantin?.document;
  const open = state.drivePanelOpen && document !== undefined;
  return {
    open,
    title: t("drives.title"),
    drivesTitle: t("drives.section"),
    drives:
      document === undefined
        ? []
        : document.drives.map((drive) => driveCard(document, drive, state, t)),
    form:
      document === undefined || state.driveForm === null
        ? null
        : formView(state.driveForm, state, document, t),
    actuators: document === undefined ? null : buildActuatorSectionView(state, document, t),
    sensors: document === undefined ? null : buildSensorSectionView(state, document, t),
  };
}
