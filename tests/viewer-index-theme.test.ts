import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// index.html repeats the theme resolution to avoid a flash before the first
// paint; this keeps its copy of the stored key and of the attribute in step.

describe("the theme script of index.html", () => {
  const html = readFileSync(new URL("../packages/viewer/index.html", import.meta.url), "utf8");

  it("reads the same storage key as the viewer", () => {
    const storage = readFileSync(
      new URL("../packages/viewer/src/ui/browser-storage.ts", import.meta.url),
      "utf8",
    );
    const key = /theme: "([\w.]+)"/.exec(storage)?.[1];
    expect(key).toBe("pantin.viewer.theme");
    expect(html).toContain(`getItem("${key}")`);
  });

  // Runs the inline script against a stub page. The expected themes are the
  // resolveTheme rules of src/theme/theme.ts, which theme.test.ts checks there.
  function themeSetBy(stored: string | null, systemPrefersDark: boolean): string | undefined {
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    const root = { dataset: {} as Record<string, string>, style: { colorScheme: "" } };
    const stubWindow = {
      localStorage: { getItem: () => stored },
      matchMedia: (query: string) => ({
        matches: query === "(prefers-color-scheme: dark)" && systemPrefersDark,
      }),
    };
    new Function("window", "document", script)(stubWindow, { documentElement: root });
    expect(root.style.colorScheme).toBe(root.dataset.theme);
    return root.dataset.theme;
  }

  it("resolves the stored choice like resolveTheme", () => {
    expect(themeSetBy("light", true)).toBe("light");
    expect(themeSetBy("dark", false)).toBe("dark");
    expect(themeSetBy("system", true)).toBe("dark");
    expect(themeSetBy("system", false)).toBe("light");
    expect(themeSetBy(null, true)).toBe("dark");
    expect(themeSetBy("purple", false)).toBe("light");
  });

  it("sets the data-theme attribute that base.css selects on", () => {
    expect(html).toContain("dataset.theme");
    expect(
      readFileSync(new URL("../packages/viewer/src/styles/base.css", import.meta.url), "utf8"),
    ).toContain(':root[data-theme="light"]');
  });
});
