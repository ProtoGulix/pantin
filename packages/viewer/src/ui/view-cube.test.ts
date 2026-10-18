import { describe, expect, it } from "vitest";
import { AXIS_COLOURS } from "../theme/data-palette.ts";
import { paintTriad } from "./view-cube.ts";

function fakeNode() {
  const attributes = new Map<string, string>();
  return { attributes, setAttribute: (name: string, value: string) => attributes.set(name, value) };
}

describe("the view cube triad", () => {
  it("paints each axis's line and letter with the colours of the theme", () => {
    const nodes = {
      x: { line: fakeNode(), letter: fakeNode() },
      y: { line: fakeNode(), letter: fakeNode() },
      z: { line: fakeNode(), letter: fakeNode() },
    };
    paintTriad(nodes, AXIS_COLOURS.light);
    expect(nodes.x.line.attributes.get("stroke")).toBe(AXIS_COLOURS.light.x);
    expect(nodes.y.letter.attributes.get("fill")).toBe(AXIS_COLOURS.light.y);
    paintTriad(nodes, AXIS_COLOURS.dark);
    expect(nodes.z.line.attributes.get("stroke")).toBe(AXIS_COLOURS.dark.z);
    expect(nodes.z.letter.attributes.get("fill")).toBe(AXIS_COLOURS.dark.z);
  });
});
