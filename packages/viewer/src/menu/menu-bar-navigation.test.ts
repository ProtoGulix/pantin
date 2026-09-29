import { describe, expect, it } from "vitest";
import { menuBarKeyAction } from "./menu-bar-navigation.ts";

const onTitle = (menu: number) => ({ menu, item: null });

describe("menuBarKeyAction", () => {
  it("moves between closed menus with Left and Right, wrapping around", () => {
    expect(menuBarKeyAction("ArrowRight", onTitle(2), null, 3, 0)).toEqual({
      type: "move",
      open: null,
      focus: onTitle(0),
    });
    expect(menuBarKeyAction("ArrowLeft", onTitle(0), null, 3, 0)).toEqual({
      type: "move",
      open: null,
      focus: onTitle(2),
    });
  });

  it("opens the neighbour menu on its first item when a menu is open", () => {
    expect(menuBarKeyAction("ArrowRight", { menu: 0, item: 1 }, 0, 3, 4)).toEqual({
      type: "move",
      open: 1,
      focus: { menu: 1, item: 0 },
    });
  });

  it("opens a menu with Down, Enter or Space on its title", () => {
    for (const key of ["ArrowDown", "Enter", " "]) {
      expect(menuBarKeyAction(key, onTitle(1), null, 3, 0)).toEqual({
        type: "move",
        open: 1,
        focus: { menu: 1, item: 0 },
      });
    }
  });

  it("moves through items with Up and Down, wrapping around", () => {
    expect(menuBarKeyAction("ArrowUp", { menu: 0, item: 0 }, 0, 3, 4)).toEqual({
      type: "move",
      open: 0,
      focus: { menu: 0, item: 3 },
    });
  });

  it("activates the focused item with Enter", () => {
    expect(menuBarKeyAction("Enter", { menu: 0, item: 2 }, 0, 3, 4)).toEqual({ type: "activate" });
  });

  it("closes with Escape and returns to the menu title", () => {
    expect(menuBarKeyAction("Escape", { menu: 2, item: 1 }, 2, 3, 4)).toEqual({
      type: "move",
      open: null,
      focus: onTitle(2),
    });
  });

  it("ignores keys when the bar has no focus, and other keys", () => {
    expect(menuBarKeyAction("ArrowDown", null, null, 3, 0)).toBeNull();
    expect(menuBarKeyAction("a", onTitle(0), null, 3, 0)).toBeNull();
  });
});
