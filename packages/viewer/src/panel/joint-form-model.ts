import { JOINT_COORDINATE_UNITS, JOINT_PARAMETERS, type JointType } from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";
import { AXIS_DIRECTIONS, type AxisChoice } from "../joints/axis-choice.ts";
import {
  FIELD_CHILD,
  FIELD_NAME,
  FIELD_PARENT,
  formAxisChoice,
  type JointFormState,
  type ParameterPart,
  parameterInputs,
  VECTOR_AXES,
  vectorFieldId,
} from "../joints/joint-form.ts";
import { JOINT_TYPES, jointTypeLabelKey, parameterLabelKey } from "../joints/joint-labels.ts";
import { displayUnitLabel } from "../joints/joint-parameters.ts";
import { displayUnitOf } from "../units.ts";
import type { ViewerState } from "../viewer-state.ts";

// The inline joint form as data, to create a joint or change a stored one.
// Its rows after the shared ones come from JOINT_PARAMETERS, so a new joint
// type needs nothing here.

interface JointFormInputView {
  id: string;
  ariaLabel: string;
  value: string;
}

export interface JointFormRowView {
  label: string;
  // Unit symbol shown after the inputs; null for unitless values (the axis).
  unit: string | null;
  inputs: JointFormInputView[];
}

export interface JointFormView {
  title: string;
  confirmLabel: string;
  type: JointType;
  typeOptions: readonly { value: string; label: string }[];
  name: string;
  nameFieldId: string;
  parentFieldId: string;
  childFieldId: string;
  parent: string;
  child: string;
  // Body id to body name.
  bodyOptions: readonly { value: string; label: string }[];
  origin: JointFormRowView;
  axis: JointFormAxisView;
  // The type's parameters, from JOINT_PARAMETERS.
  rows: JointFormRowView[];
  canSubmit: boolean;
}

export interface JointFormAxisView {
  label: string;
  hint: string;
  choice: AxisChoice;
  // X, Y, Z then custom.
  options: readonly { value: AxisChoice["direction"]; label: string }[];
  // X, Y or Z only: a custom direction takes its sense from the typed signs,
  // which change without a redraw, so a checkbox there would show stale state.
  reversed: { label: string; checked: boolean } | null;
  // The three components, shown only for a custom direction.
  components: JointFormRowView | null;
}

const PART_LABELS = {
  lower: "joint.form.lower",
  upper: "joint.form.upper",
  value: "joint.form.value",
} as const satisfies Record<ParameterPart, string>;

function vectorRow(
  vector: "origin" | "axis",
  form: JointFormState,
  unit: string | null,
  t: Translate,
): JointFormRowView {
  const label = t(vector === "origin" ? "joint.form.origin" : "joint.form.axis");
  return {
    label,
    unit,
    inputs: VECTOR_AXES.map((axis) => {
      const id = vectorFieldId(vector, axis);
      return {
        id,
        ariaLabel: `${label} ${t(`joint.form.axis.${axis}`)}`,
        value: form.values[id] ?? "",
      };
    }),
  };
}

function axisView(form: JointFormState, t: Translate): JointFormAxisView {
  const choice = formAxisChoice(form);
  return {
    label: t("joint.form.axis"),
    hint: t("joint.form.axis.hint"),
    choice,
    options: [
      ...AXIS_DIRECTIONS.map((direction) => ({
        value: direction,
        label: t(`joint.form.axis.${direction}`),
      })),
      { value: "custom", label: t("joint.form.axis.custom") },
    ],
    reversed:
      choice.direction === "custom"
        ? null
        : { label: t("joint.form.axis.reversed"), checked: choice.reversed },
    components: choice.direction === "custom" ? vectorRow("axis", form, null, t) : null,
  };
}

function parameterRows(form: JointFormState, t: Translate): JointFormRowView[] {
  const coordinateUnit = displayUnitOf(JOINT_COORDINATE_UNITS[form.type]);
  return JOINT_PARAMETERS[form.type].map((parameter) => {
    const label = t(parameterLabelKey(parameter.field));
    // A length is always in millimetres; a range follows the coordinate's unit.
    const unit = parameter.kind === "length" ? "mm" : coordinateUnit;
    return {
      label,
      unit: unit === null ? null : displayUnitLabel(unit, t),
      inputs: parameterInputs(parameter).map((input) => ({
        id: input.id,
        ariaLabel: `${label} ${t(PART_LABELS[input.part])}`,
        value: form.values[input.id] ?? "",
      })),
    };
  });
}

export function buildJointFormView(state: ViewerState, t: Translate): JointFormView | null {
  const form = state.jointForm;
  const open = state.openPantin;
  if (form === null || open === null) {
    return null;
  }
  const creating = form.jointId === null;
  return {
    // The name typed in the form: the joint may have been deleted meanwhile.
    title: creating
      ? t("joint.form.title", { pantinName: open.document.name })
      : t("joint.form.editTitle", { name: form.values[FIELD_NAME] ?? "" }),
    confirmLabel: t(creating ? "joint.form.confirm" : "joint.form.apply"),
    type: form.type,
    typeOptions: JOINT_TYPES.map((type) => ({ value: type, label: t(jointTypeLabelKey(type)) })),
    name: form.values[FIELD_NAME] ?? "",
    nameFieldId: FIELD_NAME,
    parentFieldId: FIELD_PARENT,
    childFieldId: FIELD_CHILD,
    parent: form.values[FIELD_PARENT] ?? "",
    child: form.values[FIELD_CHILD] ?? "",
    bodyOptions: open.document.bodies.map((body) => ({ value: body.id, label: body.name })),
    origin: vectorRow("origin", form, displayUnitLabel("mm", t), t),
    axis: axisView(form, t),
    rows: parameterRows(form, t),
    canSubmit: state.pendingRequestCount === 0,
  };
}
