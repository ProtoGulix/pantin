// A value typed in a numeric command field and not sent yet (inspector, ADR
// 0043) survives the redraw of its panel, even when the field had lost the
// focus: the panels are rebuilt from their view on every change, which would
// empty it. As before, the last value sent stays shown after Send. The logic
// works on any object shaped like an input, so that it is tested without a DOM.

export const DRAFT_ATTRIBUTE = "data-draft";

interface DraftField {
  value: string;
  getAttribute(name: string): string | null;
}

export function collectDrafts(fields: Iterable<DraftField>): ReadonlyMap<string, string> {
  const drafts = new Map<string, string>();
  for (const field of fields) {
    const key = field.getAttribute(DRAFT_ATTRIBUTE);
    if (key !== null && field.value !== "") {
      drafts.set(key, field.value);
    }
  }
  return drafts;
}

export function applyDrafts(
  fields: Iterable<DraftField>,
  drafts: ReadonlyMap<string, string>,
): void {
  for (const field of fields) {
    const key = field.getAttribute(DRAFT_ATTRIBUTE);
    const draft = key === null ? undefined : drafts.get(key);
    if (draft !== undefined && field.value === "") {
      field.value = draft;
    }
  }
}

const SELECTOR = `input[${DRAFT_ATTRIBUTE}]`;

export function captureDrafts(root: HTMLElement): ReadonlyMap<string, string> {
  return collectDrafts(root.querySelectorAll<HTMLInputElement>(SELECTOR));
}

export function restoreDrafts(root: HTMLElement, drafts: ReadonlyMap<string, string>): void {
  applyDrafts(root.querySelectorAll<HTMLInputElement>(SELECTOR), drafts);
}
