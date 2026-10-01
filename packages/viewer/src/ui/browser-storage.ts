// Remembered UI preferences (language, pane sizes). Storage can be disabled
// or full (private mode, quotas): a failure only means the preference is not
// remembered, which is harmless, so it is deliberately not reported.

export const STORAGE_KEYS = {
  language: "pantin.viewer.language",
  panelWidth: "pantin.viewer.panelWidth",
} as const;

export function readStoredText(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStoredText(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not remembered; see the comment at the top of the file.
  }
}
