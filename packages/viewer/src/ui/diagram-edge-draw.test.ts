import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiagramEdge } from "../diagram/diagram-types.ts";
import { drawEdge } from "./diagram-edge-draw.ts";

// The viewer tests run in Node: a minimal fake document records what svgElement builds.

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: (FakeElement | string)[] = [];

  readonly tag: string;

  constructor(tag: string) {
    this.tag = tag;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  append(...nodes: (FakeElement | string)[]): void {
    this.children.push(...nodes);
  }
}

const EDGE: DiagramEdge = {
  id: "e1",
  kind: "pneumatic",
  fromNode: "drive:v",
  fromSocket: "out:2",
  toNode: "actuator:c",
  toSocket: "in:cap",
  points: [
    { x: 0, y: 10 },
    { x: 100, y: 10 },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("drawEdge", () => {
  it("writes the abbreviation of the kind on the label, near its wire", () => {
    vi.stubGlobal("document", {
      createElementNS: (_ns: string, tag: string) => new FakeElement(tag),
    });
    const drawn = drawEdge(EDGE, "Pneumatic link: V1 to C1", "PNEU");
    // The fake stands in for the SVG element, which only the tests see.
    const label = drawn.label as unknown as FakeElement;
    expect(label.tag).toBe("text");
    expect(label.children).toEqual(["PNEU"]);
    expect(label.attributes.get("class")).toBe("diagram-edge__label");
    expect(label.attributes.get("x")).toBe("35");
    expect(label.attributes.get("y")).toBe("6");
  });

  it("keeps the kind in the class of the wire", () => {
    vi.stubGlobal("document", {
      createElementNS: (_ns: string, tag: string) => new FakeElement(tag),
    });
    const wire = drawEdge(EDGE, "x", "PNEU").wire as unknown as FakeElement;
    expect(wire.attributes.get("class")).toBe("diagram-edge diagram-edge--pneumatic");
  });
});
