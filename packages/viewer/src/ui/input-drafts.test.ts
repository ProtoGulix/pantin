import { describe, expect, it } from "vitest";
import { applyDrafts, collectDrafts, DRAFT_ATTRIBUTE } from "./input-drafts.ts";

// The text typed in a command field outlives the redraw of the inspector.

function field(draftKey: string | null, value: string) {
  return {
    value,
    getAttribute: (name: string) => (name === DRAFT_ATTRIBUTE ? draftKey : null),
  };
}

describe("input drafts", () => {
  it("keeps the typed text of the draft fields, and skips empty and other fields", () => {
    const drafts = collectDrafts([
      field("a.v.setpoint", "12.5"),
      field("a.v.speed", ""),
      field(null, "x"),
    ]);
    expect([...drafts]).toEqual([["a.v.setpoint", "12.5"]]);
  });

  it("puts the text back into the rebuilt, empty field with the same key", () => {
    const rebuilt = [field("a.v.setpoint", ""), field("a.v.speed", "")];
    applyDrafts(rebuilt, new Map([["a.v.setpoint", "12.5"]]));
    expect(rebuilt.map((candidate) => candidate.value)).toEqual(["12.5", ""]);
  });

  it("does not overwrite a field which already has text", () => {
    const rebuilt = [field("a.v.setpoint", "7")];
    applyDrafts(rebuilt, new Map([["a.v.setpoint", "12.5"]]));
    expect(rebuilt[0]?.value).toBe("7");
  });
});
