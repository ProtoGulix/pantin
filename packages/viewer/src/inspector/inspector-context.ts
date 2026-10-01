import type { FaultsResponse, PantinResponse } from "@pantin/protocol";
import type { Language, MessageKey, Translate } from "../i18n/translate.ts";
import type { GroupDraft } from "../properties/property-rows.ts";

// What every group builder of the inspector reads: the open Pantin, the
// language for labels that come from the type packages, the faults the core
// reported last, and the translator.
export interface InspectorContext {
  pantin: PantinResponse;
  language: Language;
  faults: FaultsResponse;
  t: Translate;
}

// What the inspector shows for one selection, before the titles and the
// collapsed state are put on the groups.
export interface InspectorContent {
  // What the grid below is about; null when nothing in it needs naming.
  subject: string | null;
  groups: GroupDraft[];
  // For a Pantin or an assembly: a line per family it has no device of.
  hints: MessageKey[];
}

export const NOTHING: InspectorContent = { subject: null, groups: [], hints: [] };
