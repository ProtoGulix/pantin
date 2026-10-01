import type { FaultsResponse, PantinResponse } from "@pantin/protocol";
import type { Language, Translate } from "../i18n/translate.ts";

// What every group builder of the inspector reads: the open Pantin, the
// language for labels that come from the type packages, the faults the core
// reported last, and the translator.
export interface InspectorContext {
  pantin: PantinResponse;
  language: Language;
  faults: FaultsResponse;
  t: Translate;
}
