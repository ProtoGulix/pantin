import { describe, expect, it, vi } from "vitest";
import { DEFAULT_NAVIGATION } from "../navigation/navigation-settings.ts";
import { testStore } from "./controller-test-helpers.ts";
import { runMenuCommand } from "./menu-commands.ts";

const noLanguage = () => undefined;

describe("navigation settings", () => {
  it("start from the SolidWorks defaults", () => {
    expect(testStore({}).state.navigation).toEqual(DEFAULT_NAVIGATION);
  });

  it("switch the preset from the menu and remember it in the browser", () => {
    const stored = vi.fn();
    const store = testStore({}, {}, undefined, { storeNavigation: stored });
    runMenuCommand(store, "navigation:zw3d", noLanguage);
    expect(store.state.navigation.preset).toBe("zw3d");
    expect(stored).toHaveBeenCalledWith({ ...DEFAULT_NAVIGATION, preset: "zw3d" });
  });

  it("ignore an unknown preset and the preset already in use", () => {
    const stored = vi.fn();
    const store = testStore({}, {}, undefined, { storeNavigation: stored });
    runMenuCommand(store, "navigation:blender" as never, noLanguage);
    runMenuCommand(store, "navigation:solidworks", noLanguage);
    expect(stored).not.toHaveBeenCalled();
  });

  it("toggle the reverse wheel and the perspective", () => {
    const store = testStore({});
    runMenuCommand(store, "reverseWheel", noLanguage);
    runMenuCommand(store, "perspective", noLanguage);
    expect(store.state.navigation).toMatchObject({ reverseWheel: true, perspective: true });
    runMenuCommand(store, "perspective", noLanguage);
    expect(store.state.navigation.perspective).toBe(false);
  });

  it("take an arrow step the menu offers and no other", () => {
    const store = testStore({});
    runMenuCommand(store, "arrowStep:45", noLanguage);
    expect(store.state.navigation.arrowStepDegrees).toBe(45);
    runMenuCommand(store, "arrowStep:7", noLanguage);
    expect(store.state.navigation.arrowStepDegrees).toBe(45);
  });

  it("are handed to the viewport on each update", () => {
    const setNavigation = vi.fn();
    const store = testStore({}, { setNavigation });
    runMenuCommand(store, "perspective", noLanguage);
    expect(setNavigation).toHaveBeenLastCalledWith({ ...DEFAULT_NAVIGATION, perspective: true });
  });
});
