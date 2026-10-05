import type { Assembly, Body, PantinResponse, Placement } from "@pantin/protocol";
import { anchorOfAssembly } from "../assembly-anchor.ts";
import type { Translate } from "../i18n/translate.ts";
import { displayUnitLabel } from "../joints/joint-parameters.ts";
import { NO_PLACEMENT_FEEDBACK, type PlacementFeedback } from "../placement-feedback.ts";
import { PLACEMENT_FIELDS, type PlacementField, placementToFields } from "../placement-units.ts";
import { formatDisplayNumber } from "../units.ts";
import {
  type GroupDraft,
  type PropertyRow,
  type RowEditor,
  row,
  rowFocusKey,
} from "./property-rows.ts";

// The anchor and the six placement fields of an assembly (ADR 0034 point 1),
// which the "Positionnement" section shows (ADR 0039), and the read only
// "Placement" group of a body that has one (ADR 0034 point 6). Values are in
// the frame of the anchor, in millimetres and degrees; the angles convention
// lives in placement-units.ts.

function fieldLabel(field: PlacementField, t: Translate): string {
  const unit = displayUnitLabel(field.startsWith("r") ? "degree" : "mm", t);
  return `${t(`placement.field.${field}`)} (${unit})`;
}

function placementRowId(field: PlacementField): string {
  return `placement-${field}`;
}

function valueRows(
  placement: Placement,
  t: Translate,
  editorOf: (field: PlacementField) => RowEditor | null,
  feedback: PlacementFeedback = NO_PLACEMENT_FEEDBACK,
): PropertyRow[] {
  const values = feedback.draft ?? placementToFields(placement);
  return PLACEMENT_FIELDS.map((field, index) => {
    const editor = editorOf(field);
    const next = PLACEMENT_FIELDS[index + 1];
    const rowOfField = row(
      placementRowId(field),
      fieldLabel(field, t),
      formatDisplayNumber(values[field]),
      editor,
    );
    return {
      ...rowOfField,
      ...(feedback.draft === null ? {} : { dragged: true }),
      ...(feedback.invalid?.field === field ? { invalidText: feedback.invalid.text } : {}),
      // Only a field that can be typed in passes the focus on.
      ...(editor === null || next === undefined
        ? {}
        : { nextFocusKey: rowFocusKey(placementRowId(next)) }),
    };
  });
}

/** "monde", or the name of the assembly the placement is relative to. */
function anchorRow(anchorName: string | null, t: Translate): PropertyRow {
  return row("placement-anchor", t("placement.anchor"), anchorName ?? t("placement.anchor.world"));
}

export function assemblyPlacementGroup(
  assembly: Assembly,
  pantin: PantinResponse,
  t: Translate,
  feedback: PlacementFeedback = NO_PLACEMENT_FEEDBACK,
): GroupDraft {
  const { document } = pantin;
  const anchorKey = anchorOfAssembly(document, assembly.key);
  const anchorName =
    anchorKey === null
      ? null
      : (document.assemblies.find((candidate) => candidate.key === anchorKey)?.name ?? anchorKey);
  const rows = valueRows(
    assembly.placement,
    t,
    (field) => ({
      input: "text",
      target: { kind: "assemblyPlacement", pantinId: pantin.id, key: assembly.key, field },
    }),
    feedback,
  );
  return {
    id: "assemblyPlacement",
    // The six fields are in the anchor's frame (ADR 0042 point 3).
    title:
      anchorName === null
        ? t("placement.title.world")
        : t("placement.title.anchor", { anchor: anchorName }),
    rows: [anchorRow(anchorName, t), ...rows],
    ...(feedback.invalid === null ? {} : { error: t("placement.invalidNote") }),
  };
}

/** Read only: a body's placement is written by the core only (ADR 0033 point 7). */
export function bodyPlacementGroup(body: Body, pantin: PantinResponse, t: Translate): GroupDraft[] {
  if (body.placement === undefined) {
    return [];
  }
  const assembly = pantin.document.assemblies.find((candidate) => candidate.key === body.assembly);
  return [
    {
      id: "bodyPlacement",
      rows: [
        anchorRow(assembly?.name ?? body.assembly, t),
        ...valueRows(body.placement, t, () => null),
      ],
    },
  ];
}
