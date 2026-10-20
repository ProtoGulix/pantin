import { describe, expect, it } from "vitest";
import { escapeClearsFilter, fieldTextToWrite } from "./diagram-filter-field.ts";

describe("Escape in the filter field", () => {
  it("clears and is taken only when the field has text", () => {
    expect(escapeClearsFilter("Escape", "valve")).toBe(true);
    expect(escapeClearsFilter("Escape", "")).toBe(false);
  });

  it("ignores other keys", () => {
    expect(escapeClearsFilter("Enter", "valve")).toBe(false);
  });
});

describe("the text written into the filter field", () => {
  it("is left alone while it equals the state, so that typing keeps its caret", () => {
    expect(fieldTextToWrite("val", "val")).toBeNull();
    expect(fieldTextToWrite("", "")).toBeNull();
  });

  it("follows the state when something else changed it", () => {
    expect(fieldTextToWrite("val", "")).toBe("");
    expect(fieldTextToWrite("", "belt")).toBe("belt");
  });
});
