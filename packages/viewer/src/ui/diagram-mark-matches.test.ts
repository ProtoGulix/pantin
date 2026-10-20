import { describe, expect, it } from "vitest";
import { markMatches } from "./diagram-live-apply.ts";

function fakeNode() {
  const classes = new Set<string>();
  return { classes, group: { classList: { add: (token: string) => classes.add(token) } } };
}

describe("marking the nodes that match the filter", () => {
  it("marks the matching nodes only, and ignores a match the diagram does not draw", () => {
    const first = fakeNode();
    const second = fakeNode();
    markMatches(
      new Map([
        ["drive:a", first],
        ["drive:b", second],
      ]),
      new Set(["drive:a", "drive:gone"]),
    );
    expect([...first.classes]).toEqual(["is-match"]);
    expect(second.classes.size).toBe(0);
  });
});
