import { describe, expect, it } from "vitest";
import type { ThemeName } from "../theme/theme.ts";
import { createThemeController } from "./theme-controller.ts";

function setUp(prefersDark: boolean, choice: "system" | "light" | "dark") {
  const root = { dataset: {} as { theme?: string }, style: { colorScheme: "" } };
  const query = {
    matches: prefersDark,
    listeners: [] as (() => void)[],
    addEventListener(_type: "change", listener: () => void) {
      this.listeners.push(listener);
    },
  };
  const applied: ThemeName[] = [];
  const controller = createThemeController(root, query, choice, (theme) => applied.push(theme));
  return { root, query, applied, controller };
}

describe("createThemeController", () => {
  it("applies the resolved theme at once, to the page and to the listener", () => {
    const { root, applied } = setUp(true, "system");
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
    expect(applied).toEqual(["dark"]);
  });

  it("follows the system preference while the choice is system", () => {
    const { root, query } = setUp(false, "system");
    query.matches = true;
    for (const listener of query.listeners) {
      listener();
    }
    expect(root.dataset.theme).toBe("dark");
  });

  it("keeps an explicit choice when the system preference changes", () => {
    const { root, query, controller } = setUp(false, "system");
    controller.choose("light");
    query.matches = true;
    for (const listener of query.listeners) {
      listener();
    }
    expect(root.dataset.theme).toBe("light");
  });

  it("switches at once when a new choice is made", () => {
    const { root, applied, controller } = setUp(false, "light");
    controller.choose("dark");
    expect(root.dataset.theme).toBe("dark");
    expect(applied).toEqual(["light", "dark"]);
  });
});
