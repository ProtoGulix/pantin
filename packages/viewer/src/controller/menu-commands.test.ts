import { describe, expect, it } from "vitest";
import type { MenuCommand } from "../menu/menu-model.ts";
import { withWelcomeHidden } from "../session-state.ts";
import { pantinResponse } from "../test-fixtures.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { closeAbout, openAbout } from "./about-actions.ts";
import { testStore } from "./controller-test-helpers.ts";
import { runMenuCommand } from "./menu-commands.ts";

const ignoreLanguage = () => undefined;

describe("runMenuCommand with no Pantin open", () => {
  it("shows the welcome dialog again on File > Welcome, keeping its tab", () => {
    const store = testStore({});
    store.state = { ...withWelcomeHidden(store.state), welcomeTab: "all" };
    runMenuCommand(store, "welcome", ignoreLanguage);
    expect(store.state).toMatchObject({ welcomeHidden: false, welcomeTab: "all" });
  });

  it("shows the list of All Pantins on File > Open", () => {
    const store = testStore({});
    store.state = withWelcomeHidden(store.state);
    runMenuCommand(store, "open", ignoreLanguage);
    expect(store.state).toMatchObject({ welcomeHidden: false, welcomeTab: "all" });
  });

  it("still closes the open Pantin on File > Open", () => {
    const store = testStore({ listPantins: async () => [] });
    store.state = withOpenPantin(store.state, pantinResponse(false));
    runMenuCommand(store, "open", ignoreLanguage);
    expect(store.state.openPantin).toBeNull();
    expect(store.state.welcomeHidden).toBe(false);
  });
});

describe("runMenuCommand on the central layout and the language", () => {
  it("sets the layout named after layout:, and falls back to both on garbage", () => {
    const store = testStore({});
    runMenuCommand(store, "layout:3d", ignoreLanguage);
    expect(store.state.centralLayout).toBe("3d");
    // Cast: the type forbids a bad suffix, which is what this test feeds in.
    runMenuCommand(store, "layout:sideways" as MenuCommand, ignoreLanguage);
    expect(store.state.centralLayout).toBe("both");
  });

  it("cycles the layout on cycleLayout", () => {
    const store = testStore({});
    runMenuCommand(store, "cycleLayout", ignoreLanguage);
    expect(store.state.centralLayout).toBe("3d");
  });

  it("still hands language:en to changeLanguage, without touching the layout", () => {
    const store = testStore({});
    const chosen: string[] = [];
    runMenuCommand(store, "language:en", (language) => chosen.push(language));
    expect(chosen).toEqual(["en"]);
    expect(store.state.centralLayout).toBe("both");
  });
});

describe("runMenuCommand on the theme", () => {
  it("applies and remembers the theme named after theme:", () => {
    const applied: string[] = [];
    const store = testStore({}, {}, undefined, { applyTheme: (choice) => applied.push(choice) });
    runMenuCommand(store, "theme:dark", ignoreLanguage);
    expect(applied).toEqual(["dark"]);
    expect(store.state.themeChoice).toBe("dark");
  });

  it("ignores an unknown theme", () => {
    const applied: string[] = [];
    const store = testStore({}, {}, undefined, { applyTheme: (choice) => applied.push(choice) });
    // Cast: the type forbids a bad suffix, which is what this test feeds in.
    runMenuCommand(store, "theme:sepia" as MenuCommand, ignoreLanguage);
    expect(applied).toEqual([]);
    expect(store.state.themeChoice).toBe("system");
  });
});

describe("runMenuCommand on the console", () => {
  it("opens and closes the console from Affichage > Console, and from nothing else", () => {
    const store = testStore({});
    store.state = withOpenPantin(store.state, pantinResponse(false));
    expect(store.state.console.open).toBe(false);
    runMenuCommand(store, "toggleConsole", ignoreLanguage);
    expect(store.state.console.open).toBe(true);
    runMenuCommand(store, "toggleConsole", ignoreLanguage);
    expect(store.state.console.open).toBe(false);
  });
});

describe("runMenuCommand on the Help menu", () => {
  it("opens the user guide in the language of the viewer", () => {
    const opened: string[] = [];
    const store = testStore({}, {}, () => undefined, { openLink: (url) => opened.push(url) });
    runMenuCommand(store, "documentation", ignoreLanguage);
    store.state = { ...store.state, language: "en" };
    runMenuCommand(store, "documentation", ignoreLanguage);
    expect(opened.map((url) => url.endsWith("/docs/site/en"))).toEqual([false, true]);
    expect(opened[0]?.endsWith("/docs/site")).toBe(true);
  });

  it("opens About loading, then shows the core version", async () => {
    const store = testStore({ getCoreVersion: async () => "0.2.0+abc1234" });
    runMenuCommand(store, "about", ignoreLanguage);
    expect(store.state.about).toEqual({ open: true, core: { status: "loading" } });
    await Promise.resolve();
    await Promise.resolve();
    expect(store.state.about.core).toEqual({ status: "known", version: "0.2.0+abc1234" });
  });

  it("says the core is unreachable when the version cannot be read", async () => {
    const store = testStore({
      getCoreVersion: async () => {
        throw new Error("offline");
      },
    });
    await openAbout(store);
    expect(store.state.about).toEqual({ open: true, core: { status: "unreachable" } });
  });

  it("closes About, and a late answer does not reopen it", async () => {
    let answer: (version: string) => void = () => undefined;
    const store = testStore({
      getCoreVersion: () => new Promise<string>((resolve) => (answer = resolve)),
    });
    const opening = openAbout(store);
    closeAbout(store);
    answer("0.2.0");
    await opening;
    expect(store.state.about.open).toBe(false);
    expect(store.state.about.core).toEqual({ status: "loading" });
  });
});
