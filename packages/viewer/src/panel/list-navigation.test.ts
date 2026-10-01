import { describe, expect, it } from "vitest";
import { listCommandForKey } from "./list-navigation.ts";

const ids = ["press", "robot", "table"];

describe("listCommandForKey", () => {
  it("moves the selection with the arrows, stopping at the ends", () => {
    expect(listCommandForKey(ids, "press", "ArrowDown")).toEqual({
      type: "select",
      id: "robot",
    });
    expect(listCommandForKey(ids, "table", "ArrowDown")).toEqual({
      type: "select",
      id: "table",
    });
    expect(listCommandForKey(ids, "press", "ArrowUp")).toEqual({
      type: "select",
      id: "press",
    });
  });

  it("starts from the first or last row without selection", () => {
    expect(listCommandForKey(ids, null, "ArrowDown")).toEqual({
      type: "select",
      id: "press",
    });
    expect(listCommandForKey(ids, null, "ArrowUp")).toEqual({ type: "select", id: "table" });
  });

  it("jumps with Home and End", () => {
    expect(listCommandForKey(ids, "robot", "Home")).toEqual({ type: "select", id: "press" });
    expect(listCommandForKey(ids, "robot", "End")).toEqual({ type: "select", id: "table" });
  });

  it("opens the selected Pantin with Enter, and nothing without selection", () => {
    expect(listCommandForKey(ids, "robot", "Enter")).toEqual({ type: "open", id: "robot" });
    expect(listCommandForKey(ids, null, "Enter")).toEqual({ type: "none" });
  });

  it("does nothing on an empty list or another key", () => {
    expect(listCommandForKey([], null, "ArrowDown")).toEqual({ type: "none" });
    expect(listCommandForKey(ids, "robot", "a")).toEqual({ type: "none" });
  });
});
