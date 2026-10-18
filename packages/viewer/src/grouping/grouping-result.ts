import type { DeletedJoint, RenamedTag } from "@pantin/protocol";
import { createTranslator, type Language } from "../i18n/translate.ts";
import { infoMessage, type PanelMessage } from "../messages.ts";

// The message line after "Grouper…" or "Dégrouper" (ADR 0055 point 12): what
// was done, the fixed joints that went with it, and, when tags were renamed,
// that the PLC side must regenerate its GVL. The two optional sentences are
// translated when the message is made: the message keeps their text.

export type GroupingKind = "group" | "ungroup";

export interface GroupingResult {
  // The group that was made or dissolved.
  name: string;
  deletedJoints: readonly DeletedJoint[];
  renamedTags: readonly RenamedTag[];
}

/** The renamed tags as "from → to" pairs, or null when none. */
export function renamedTagsDetail(renamedTags: readonly RenamedTag[]): string | null {
  return renamedTags.length === 0
    ? null
    : renamedTags.map(({ from, to }) => `${from} → ${to}`).join(", ");
}

export function groupingResultMessage(
  kind: GroupingKind,
  result: GroupingResult,
  language: Language,
): PanelMessage {
  const translate = createTranslator(language);
  const names = result.deletedJoints.map((joint) => joint.name).join(", ");
  const base = infoMessage(kind === "group" ? "message.grouped" : "message.ungrouped", {
    name: result.name,
    deleted:
      result.deletedJoints.length === 0 ? "" : translate("message.group.deletedJoints", { names }),
    regenerate: result.renamedTags.length === 0 ? "" : translate("message.group.regenerateGvl"),
  });
  return { ...base, detail: renamedTagsDetail(result.renamedTags) };
}
