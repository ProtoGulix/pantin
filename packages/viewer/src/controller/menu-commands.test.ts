import { describe, expect, it } from "vitest";
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
