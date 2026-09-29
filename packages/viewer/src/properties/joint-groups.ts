import type { Joint, PantinResponse } from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";
import { AXIS_DIRECTIONS, axisChoiceOf } from "../joints/axis-choice.ts";
import {
  FIELD_CHILD,
  FIELD_NAME,
  FIELD_PARENT,
  VECTOR_AXES,
  vectorFieldId,
} from "../joints/joint-form.ts";
import { jointTypeLabelKey } from "../joints/joint-labels.ts";
import { AXIS_SENSES, FIELD_AXIS_DIRECTION, FIELD_AXIS_SENSE } from "../joints/joint-update.ts";
import { displayUnitLabel, parameterRows } from "../joints/joint-parameters.ts";
import { formatDisplayNumber, metresToMillimetres } from "../units.ts";
import { type GroupDraft, type PropertyRow, type RowEditor, row } from "./property-rows.ts";

// The properties of a joint. Everything but the type is editable: the core
// refuses a type change. Fields are named by the creation form's field ids so
// that one request builder serves both.

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
// Its components are listed only for a custom (oblique) direction.
function axisRows(joint: Joint, rows: ReturnType<typeof jointRows>, t: Translate): PropertyRow[] {
  const choice = axisChoiceOf(joint.axis);
  const directions = AXIS_DIRECTIONS.map((direction) => ({
    value: direction,
    label: t(`joint.form.axis.${direction}`),
  }));
  // Offered only while the axis is custom: choosing it would change nothing.
  const custom = { value: "custom", label: t("joint.form.axis.custom") };
  const directionOptions = choice.direction === "custom" ? [...directions, custom] : directions;
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

export function jointGroups(joint: Joint, pantin: PantinResponse, t: Translate): GroupDraft[] {
  const rows = jointRows(joint, pantin);
  const { textEditor, bodyEditor, bodyName, vectorRows } = rows;
  const groups: GroupDraft[] = [
    {
      id: "general",
      rows: [
        row("name", t("properties.name"), joint.name, textEditor(FIELD_NAME)),
        row("id", t("properties.id"), joint.id),
        row("type", t("properties.jointType"), t(jointTypeLabelKey(joint.type))),
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
        ...axisRows(joint, rows, t),
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
