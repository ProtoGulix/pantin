import { JOINT_COORDINATE_UNITS, JOINT_PARAMETERS, type JointType } from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";
import {
  FIELD_CHILD,
  FIELD_NAME,
  FIELD_PARENT,
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

// The inline "New joint" form as data. Its rows after the shared ones come
// from JOINT_PARAMETERS, so a new joint type needs nothing here.

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
  type: JointType;
  typeOptions: Readonly<Record<string, string>>;
  name: string;
  nameFieldId: string;
  parentFieldId: string;
  childFieldId: string;
  parent: string;
  child: string;
  // Body id to body name.
  bodyOptions: Readonly<Record<string, string>>;
  rows: JointFormRowView[];
  canSubmit: boolean;
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
  return {
    title: t("joint.form.title", { pantinName: open.document.name }),
    type: form.type,
    typeOptions: Object.fromEntries(JOINT_TYPES.map((type) => [type, t(jointTypeLabelKey(type))])),
    name: form.values[FIELD_NAME] ?? "",
    nameFieldId: FIELD_NAME,
    parentFieldId: FIELD_PARENT,
    childFieldId: FIELD_CHILD,
    parent: form.values[FIELD_PARENT] ?? "",
    child: form.values[FIELD_CHILD] ?? "",
    bodyOptions: Object.fromEntries(open.document.bodies.map((body) => [body.id, body.name])),
    rows: [
      vectorRow("origin", form, displayUnitLabel("mm", t), t),
      vectorRow("axis", form, null, t),
      ...parameterRows(form, t),
    ],
    canSubmit: state.pendingRequestCount === 0,
  };
}
