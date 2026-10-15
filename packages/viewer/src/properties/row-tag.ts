import type { PropertyRow } from "./property-rows.ts";

/**
 * The tag a row shows or commands, or null for a row without one. Its forced
 * state (ADR 0045 point 5) is what the inspector marks and offers to release.
 */
export function rowTagName(row: PropertyRow): string | null {
  if (row.link !== null) {
    return null;
  }
  const { edit, live } = row;
  if (edit?.input === "toggle" && edit.action.kind === "bitTag") {
    return edit.action.tag;
  }
  if (edit?.input === "number") {
    return edit.tag;
  }
  return live?.kind === "tag" ? live.tag : null;
}
