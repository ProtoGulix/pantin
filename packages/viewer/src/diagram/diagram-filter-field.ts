// What the filter field of the diagram does with keys and with the state: two
// decisions apart from the DOM, so that they are tested.

/**
 * Escape clears a filter that has text, and is then taken (it must not also
 * close something else).
 */
export function escapeClearsFilter(key: string, fieldText: string): boolean {
  return key === "Escape" && fieldText !== "";
}

/**
 * The text to write into the field, or null to leave it alone. The field is the
 * source of what the user types: it is only rewritten when the state holds
 * something else (a new Pantin, a filter cleared elsewhere), never while typing,
 * which would move the caret.
 */
export function fieldTextToWrite(fieldText: string, filter: string): string | null {
  return fieldText === filter ? null : filter;
}
