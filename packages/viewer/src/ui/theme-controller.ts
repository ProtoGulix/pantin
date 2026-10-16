import { resolveTheme, type ThemeChoice, type ThemeName } from "../theme/theme.ts";

// Applies the chosen theme to the page (ADR 0053): data-theme on the root
// element selects the token set of base.css, and color-scheme makes native
// controls (scrollbars, date pickers) match. It also follows the browser's
// preference while the choice is "system". The DOM objects are injected, so
// this needs no browser to be tested.

export interface ThemeRoot {
  dataset: { theme?: string | undefined };
  style: { colorScheme: string };
}

export interface ColorSchemeQuery {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
}

export interface ThemeController {
  choose(choice: ThemeChoice): void;
}

export function createThemeController(
  root: ThemeRoot,
  darkQuery: ColorSchemeQuery,
  initialChoice: ThemeChoice,
  onThemeApplied: (theme: ThemeName) => void,
): ThemeController {
  let choice = initialChoice;
  const apply = () => {
    const theme = resolveTheme(choice, darkQuery.matches);
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    onThemeApplied(theme);
  };
  darkQuery.addEventListener("change", apply);
  apply();
  return {
    choose: (next) => {
      choice = next;
      apply();
    },
  };
}
