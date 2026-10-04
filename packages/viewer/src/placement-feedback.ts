import type { PlacementField, PlacementFields } from "./placement-units.ts";

// What the placement fields of the inspector show besides the document (ADR 0039
// point 5). Display state of the viewer, never saved.

/** The last placement sent to the core by a gizmo drag, in display units. */
export interface PlacementDraft {
  pantinId: string;
  key: string;
  fields: PlacementFields;
}

/** Text typed in a placement field that is not a number: kept, marked, not sent. */
export interface InvalidPlacementText {
  pantinId: string;
  key: string;
  field: PlacementField;
  text: string;
}

export interface PlacementFeedback {
  draft: PlacementFields | null;
  invalid: { field: PlacementField; text: string } | null;
}

export const NO_PLACEMENT_FEEDBACK: PlacementFeedback = { draft: null, invalid: null };

/** What applies to one assembly of one Pantin. */
export function placementFeedbackOf(
  draft: PlacementDraft | null,
  invalid: InvalidPlacementText | null,
  pantinId: string,
  key: string,
): PlacementFeedback {
  const same = (candidate: { pantinId: string; key: string } | null) =>
    candidate !== null && candidate.pantinId === pantinId && candidate.key === key;
  return {
    draft: draft !== null && same(draft) ? draft.fields : null,
    invalid:
      invalid !== null && same(invalid) ? { field: invalid.field, text: invalid.text } : null,
  };
}
