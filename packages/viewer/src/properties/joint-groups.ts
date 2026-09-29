import {
  JOINT_COORDINATE_UNITS,
  type Joint,
  jointTagName,
  type PantinResponse,
} from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";
import { AXIS_DIRECTIONS, axisChoiceOf } from "../joints/axis-choice.ts";
import {
  FIELD_CHILD,
  FIELD_NAME,
  FIELD_PARENT,
  VECTOR_AXES,
  vectorFieldId,
} from "../joints/joint-form.ts";
import { JOINT_TYPES, jointTypeLabelKey } from "../joints/joint-labels.ts";
import { displayUnitLabel, parameterRows } from "../joints/joint-parameters.ts";
import { AXIS_SENSES, FIELD_AXIS_DIRECTION, FIELD_AXIS_SENSE } from "../joints/joint-update.ts";
import { formatDisplayNumber, metresToMillimetres } from "../units.ts";
import { type GroupDraft, type PropertyRow, type RowEditor, row } from "./property-rows.ts";

// The properties of a joint. Everything is editable here but the id; choosing
// another type opens the joint form, since the new type's parameters must be
// typed (ADR 0018). Fields are named by the
// creation form's field ids so that one request builder serves both.

type Vector = "origin" | "axis";

function jointRows(joint: Joint, pantin: PantinResponse) {
  const textEditor = (fieldId: string): RowEditor => ({
    input: "text",
    target: { kind: "jointField", pantinId: pantin.id, jointId: joint.id, fieldId },
  });
  const selectEditor = (
    fieldId: string,
    options: { value: string; label: string }[],
    selected: string,
  ): RowEditor => ({
    input: "select",
    target: { kind: "jointField", pantinId: pantin.id, jointId: joint.id, fieldId },
    options,
    selected,
  });
  const bodyEditor = (fieldId: string, selected: string): RowEditor =>
    selectEditor(
      fieldId,
      pantin.document.bodies.map((body) => ({ value: body.id, label: body.name })),
      selected,
    );
  const bodyName = (bodyId: string) =>
    pantin.document.bodies.find((body) => body.id === bodyId)?.name ?? bodyId;

  const vectorRows = (vector: Vector, title: string, convert: (n: number) => number) =>
    joint[vector].flatMap((component, index): PropertyRow[] => {
      const axis = VECTOR_AXES[index];
      if (axis === undefined) {
        return [];
      }
      const fieldId = vectorFieldId(vector, axis);
      const label = title.replace("{axis}", axis.toUpperCase());
      return [row(fieldId, label, formatDisplayNumber(convert(component)), textEditor(fieldId))];
    });
  return { textEditor, selectEditor, bodyEditor, bodyName, vectorRows };
}

// The axis as in the creation form: X, Y or Z of the parent body and a sense.
// Its components are listed for an oblique axis, or when the user chose
// "custom" to type one (customAxis).
function axisRows(
  joint: Joint,
  rows: ReturnType<typeof jointRows>,
  customAxis: boolean,
  t: Translate,
): PropertyRow[] {
  const stored = axisChoiceOf(joint.axis);
  const choice = customAxis ? { ...stored, direction: "custom" as const } : stored;
  const directionOptions = [
    ...AXIS_DIRECTIONS.map((direction) => ({
      value: direction,
      label: t(`joint.form.axis.${direction}`),
    })),
    { value: "custom", label: t("joint.form.axis.custom") },
  ];
  const senses = AXIS_SENSES.map((sense) => ({
    value: sense,
    label: t(`properties.axisSense.${sense}`),
  }));
  const sense = choice.reversed ? "reversed" : "positive";
  return [
    row(
      "axis-direction",
      t("properties.axis"),
      directionOptions.find((option) => option.value === choice.direction)?.label ?? "",
      rows.selectEditor(FIELD_AXIS_DIRECTION, directionOptions, choice.direction),
    ),
    row(
      "axis-sense",
      t("properties.axisSense"),
      senses.find((option) => option.value === sense)?.label ?? "",
      rows.selectEditor(FIELD_AXIS_SENSE, senses, sense),
    ),
    ...(choice.direction === "custom"
      ? rows.vectorRows("axis", `${t("properties.axis")} {axis}`, (component) => component)
      : []),
  ];
}

// The tag key names the joint's tags inside its child's assembly (ADR 0019).
// A fixed joint has no tag yet, but keeps its key for when it becomes movable.
function tagRows(joint: Joint, pantin: PantinResponse, t: Translate): PropertyRow[] {
  const assembly = pantin.document.bodies.find((body) => body.id === joint.child)?.assembly ?? "";
  const setpoint = jointTagName(assembly, joint.tagKey, "setpoint");
  const position = jointTagName(assembly, joint.tagKey, "position");
  const tags =
    JOINT_COORDINATE_UNITS[joint.type] === null
      ? t("properties.noTag")
      : `${setpoint}, ${position}`;
  const target = { kind: "tagKey" as const, pantinId: pantin.id, jointId: joint.id };
  return [
    row("tagKey", t("properties.tagKey"), joint.tagKey, { input: "text", target }),
    { ...row("tags", t("properties.tags"), tags), muted: true },
  ];
}

export function jointGroups(
  joint: Joint,
  pantin: PantinResponse,
  customAxis: boolean,
  t: Translate,
): GroupDraft[] {
  const rows = jointRows(joint, pantin);
  const { textEditor, bodyEditor, bodyName, vectorRows } = rows;
  const groups: GroupDraft[] = [
    {
      id: "general",
      rows: [
        row("name", t("properties.name"), joint.name, textEditor(FIELD_NAME)),
        row("id", t("properties.id"), joint.id),
        ...tagRows(joint, pantin, t),
        row("type", t("properties.jointType"), t(jointTypeLabelKey(joint.type)), {
          input: "select",
          target: { kind: "jointType", pantinId: pantin.id, jointId: joint.id },
          options: JOINT_TYPES.map((type) => ({ value: type, label: t(jointTypeLabelKey(type)) })),
          selected: joint.type,
        }),
        row(
          "parent",
          t("properties.parent"),
          bodyName(joint.parent),
          bodyEditor(FIELD_PARENT, joint.parent),
        ),
        row(
          "child",
          t("properties.child"),
          bodyName(joint.child),
          bodyEditor(FIELD_CHILD, joint.child),
        ),
      ],
    },
    {
      id: "placement",
      rows: [
        ...axisRows(joint, rows, customAxis, t),
        ...vectorRows(
          "origin",
          `${t("properties.origin")} {axis} (${displayUnitLabel("mm", t)})`,
          metresToMillimetres,
        ),
      ],
    },
  ];
  const parameters = parameterRows(joint, t).map((entry) =>
    row(`parameter-${entry.inputId}`, entry.label, entry.value, textEditor(entry.inputId)),
  );
  return parameters.length === 0 ? groups : [...groups, { id: "parameters", rows: parameters }];
}
