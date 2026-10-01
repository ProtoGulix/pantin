import { describe, expect, it } from "vitest";
import type { MenuCommand } from "../menu/menu-model.ts";
import { withWelcomeHidden } from "../session-state.ts";
import { pantinResponse } from "../test-fixtures.ts";
import { withOpenPantin } from "../viewer-state.ts";
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
