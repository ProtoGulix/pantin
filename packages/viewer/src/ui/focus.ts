// What the user was typing survives the rebuild of a region: panels are
// redrawn from their view on every change (side-panel.ts, drive-panel.ts).

interface FocusSnapshot {
  key: string;
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
}

export function captureFocus(root: HTMLElement): FocusSnapshot | null {
  const active = document.activeElement;
  const key = active?.getAttribute("data-focus-key");
  if (!(active instanceof HTMLInputElement) || !root.contains(active) || !key) {
    return null;
  }
  const { value, selectionStart, selectionEnd } = active;
  return { key, value, selectionStart, selectionEnd };
}

export function restoreFocus(root: HTMLElement, snapshot: FocusSnapshot | null): void {
  const input = [...root.querySelectorAll("input")].find(
    (candidate) => candidate.getAttribute("data-focus-key") === snapshot?.key,
  );
  if (snapshot !== null && input !== undefined && document.activeElement !== input) {
    input.value = snapshot.value;
    input.focus();
    input.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  }
}
