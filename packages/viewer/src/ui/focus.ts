// What the user was typing, or which toggle they were on, survives the rebuild
// of a region: panels are redrawn from their view on every change
// (side-panel.ts, inspector.ts).

interface FocusSnapshot {
  key: string;
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
}

export function captureFocus(root: HTMLElement): FocusSnapshot | null {
  const active = document.activeElement;
  const key = active?.getAttribute("data-focus-key");
  if (!root.contains(active) || !key) {
    return null;
  }
  if (active instanceof HTMLInputElement) {
    const { value, selectionStart, selectionEnd } = active;
    return { key, value, selectionStart, selectionEnd };
  }
  // A button keeps no text of its own.
  return active instanceof HTMLButtonElement
    ? { key, value: "", selectionStart: null, selectionEnd: null }
    : null;
}

export function restoreFocus(root: HTMLElement, snapshot: FocusSnapshot | null): void {
  const target = [...root.querySelectorAll("input, button")].find(
    (candidate) => candidate.getAttribute("data-focus-key") === snapshot?.key,
  );
  if (snapshot === null || target === undefined || document.activeElement === target) {
    return;
  }
  if (target instanceof HTMLInputElement) {
    target.value = snapshot.value;
    target.focus();
    target.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  } else if (target instanceof HTMLElement) {
    target.focus();
  }
}

/** Focuses, with its text selected, the field a keyboard command asked for. */
export function focusField(root: HTMLElement, key: string): void {
  const target = [...root.querySelectorAll("input")].find(
    (candidate) => candidate.getAttribute("data-focus-key") === key,
  );
  target?.focus();
  target?.select();
}
