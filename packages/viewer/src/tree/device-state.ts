import type { PantinDocument } from "@pantin/protocol";
import type { MessageKey } from "../i18n/translate.ts";
import { documentStateTags } from "./device-families.ts";

// The on or off mark at the end of a sensor row (ADR 0047 point 3). The viewer
// computes nothing: it reads the tag values it already polls.

export type StateMark = "on" | "off";

export type TagValues = ReadonlyMap<string, number>;

export const NO_TAG_VALUES: TagValues = new Map();

/** On from 0.5, like the 3D beams and the diagram; null while the tag is not polled yet. */
export function stateMarkOf(stateTag: string | null, values: TagValues): StateMark | null {
  const value = stateTag === null ? undefined : values.get(stateTag);
  if (value === undefined) {
    return null;
  }
  return value >= 0.5 ? "on" : "off";
}

export const STATE_MARK_LABELS: Readonly<Record<StateMark, MessageKey>> = {
  on: "tree.state.on",
  off: "tree.state.off",
};

/**
 * What the marks of the whole document show, as one text: the panel is redrawn
 * only when it changes, not at every poll of the tags.
 */
export function stateMarksKey(document: PantinDocument, values: TagValues): string {
  return documentStateTags(document)
    .map((tag) => stateMarkOf(tag, values) ?? "-")
    .join(",");
}
