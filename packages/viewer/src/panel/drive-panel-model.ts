import { DRIVE_LABELS } from "@pantin/drive-types/labels";
import {
  DRIVE_PARAMETERS,
  DRIVE_TAGS,
  type Drive,
  type DriveParameterKind,
  type JointCoordinateUnit,
  type PantinDocument,
  tagName,
} from "@pantin/protocol";
import {
  DRIVE_TYPES,
  type DriveFormState,
  driveCoordinateUnit,
  movableJoints,
} from "../drives/drive-form.ts";
import type { Language, Translate } from "../i18n/translate.ts";
import { displayUnitLabel } from "../joints/joint-parameters.ts";
import { displayUnitOf } from "../units.ts";
import type { ViewerState } from "../viewer-state.ts";

// The drives panel on the right (ADR 0022) as data: each drive with its tags
// and the joints it moves, and the drive form. Drive types, parameters and
// tags come from the registries; their labels from @pantin/drive-types.
// Tag values are not here: they change at every step and are written straight
// into the page (showTagValues), like the joint sliders.

// Values arrive in SI; `coordinateUnit` says how to show them (mm or
// degrees), null for a bit.
export interface DriveTagView {
  name: string;
  label: string;
  // "bit": a switch; "float": a value to send; "feedback": read only.
  control: "bit" | "float" | "feedback";
  unit: string | null;
  coordinateUnit: JointCoordinateUnit;
}

interface DriveJointView {
  id: string;
  name: string;
  positionTag: string;
  unit: string | null;
  coordinateUnit: JointCoordinateUnit;
  jammed: boolean;
}

export interface DriveCardView {
  id: string;
  name: string;
  typeLabel: string;
  tagPrefix: string;
  unresponsive: boolean;
  tags: DriveTagView[];
  joints: DriveJointView[];
}

export interface DriveFormView {
  title: string;
  confirmLabel: string;
  name: string;
  type: string;
  typeOptions: { value: string; label: string }[];
  assembly: string;
  assemblyOptions: { value: string; label: string }[];
  joints: { id: string; label: string; checked: boolean }[];
  parameters: { field: string; label: string; unit: string | null; value: string }[];
  canSubmit: boolean;
}

export interface DrivePanelView {
  open: boolean;
  title: string;
  canCreate: boolean;
  drives: DriveCardView[];
  form: DriveFormView | null;
}

function rateUnit(unit: JointCoordinateUnit, kind: DriveParameterKind | null, t: Translate) {
  const display = displayUnitOf(unit);
  if (display === null) {
    return null;
  }
  const base = displayUnitLabel(display, t);
  return kind === null ? base : `${base}/${kind === "speed" ? "s" : "s²"}`;
}

function driveCard(document: PantinDocument, drive: Drive, state: ViewerState, t: Translate) {
  const labels = DRIVE_LABELS[drive.type][state.language];
  const unit = driveCoordinateUnit(document, drive.joints);
  const assemblyOf = (bodyId: string) =>
    document.bodies.find((body) => body.id === bodyId)?.assembly ?? "";
  const card: DriveCardView = {
    id: drive.id,
    name: drive.name,
    typeLabel: labels.name,
    tagPrefix: `${drive.assembly}.${drive.tagKey}`,
    unresponsive: state.faults.unresponsiveDrives.includes(drive.id),
    tags: DRIVE_TAGS[drive.type].map((tag) => ({
      name: tagName(drive.assembly, drive.tagKey, tag.member),
      label: labels.tags[tag.member] ?? tag.member,
      control: tag.direction === "feedback" ? "feedback" : tag.type === "bit" ? "bit" : "float",
      unit:
        tag.quantity === undefined
          ? null
          : rateUnit(unit, tag.quantity === "speed" ? "speed" : null, t),
      coordinateUnit: tag.quantity === undefined ? null : unit,
    })),
    joints: document.joints
      .filter((joint) => drive.joints.includes(joint.id))
      .map((joint) => ({
        id: joint.id,
        name: joint.name,
        positionTag: tagName(assemblyOf(joint.child), joint.tagKey, "position"),
        unit: rateUnit(unit, null, t),
        coordinateUnit: unit,
        jammed: state.faults.jammedJoints.includes(joint.id),
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
  const unit = driveCoordinateUnit(document, form.joints);
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
    joints: movableJoints(document).map((joint) => ({
      id: joint.id,
      label: joint.name,
      checked: form.joints.includes(joint.id),
    })),
    parameters: DRIVE_PARAMETERS[form.type].map((parameter) => ({
      field: parameter.field,
      label: labels.parameters[parameter.field] ?? parameter.field,
      unit: rateUnit(unit, parameter.kind, t),
      value: form.values[parameter.field] ?? "",
    })),
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
    canCreate: document !== undefined && movableJoints(document).length > 0,
    drives:
      document === undefined
        ? []
        : document.drives.map((drive) => driveCard(document, drive, state, t)),
    form:
      document === undefined || state.driveForm === null
        ? null
        : formView(state.driveForm, state, document, t),
  };
}
