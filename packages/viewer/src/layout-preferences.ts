// Remembered layout choices of the inspector (ADR 0039 point 8). Pure: stored
// text in, safe values out, so a corrupt value never breaks the start-up.

export interface InspectorPreferences {
  inspectorOpen: boolean;
  collapsedGroups: ReadonlySet<string>;
}

export const DEFAULT_INSPECTOR_PREFERENCES: InspectorPreferences = {
  inspectorOpen: true,
  collapsedGroups: new Set(),
};

export function parseStoredOpen(text: string | null): boolean {
  if (text === "false") {
    return false;
  }
  return true;
}

export function parseStoredGroups(text: string | null): ReadonlySet<string> {
  if (text === null) {
    return new Set();
  }
  try {
    const value: unknown = JSON.parse(text);
    if (!Array.isArray(value)) {
      return new Set();
    }
    return new Set(value.filter((entry): entry is string => typeof entry === "string"));
  } catch {
    return new Set();
  }
}

export function serializeGroups(groups: ReadonlySet<string>): string {
  return JSON.stringify([...groups]);
}
