// The viewer's colour theme (ADR 0053). The user chooses "system", "light" or
// "dark"; the page and the 3D view only ever see the resolved name.

export const THEME_CHOICES = ["system", "light", "dark"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

export type ThemeName = "light" | "dark";

const DEFAULT_THEME_CHOICE: ThemeChoice = "system";

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === "string" && (THEME_CHOICES as readonly string[]).includes(value);
}

/** An unknown or missing stored value falls back to following the system. */
export function parseStoredTheme(stored: string | null): ThemeChoice {
  return isThemeChoice(stored) ? stored : DEFAULT_THEME_CHOICE;
}

/** "system" follows the browser's colour scheme preference. */
export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): ThemeName {
  if (choice === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return choice;
}
