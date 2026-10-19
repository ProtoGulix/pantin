import { bodyEndpoint } from "@pantin/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { starDocument } from "../joint-star/joint-star-fixtures.ts";
import { buildJointStarForest } from "../joint-star/joint-star-forest.ts";
import { layoutJointStar } from "../joint-star/joint-star-layout.ts";
import { drawJointStar } from "./joint-star-draw.ts";

// The viewer tests run in Node: a minimal fake document records what svgElement builds.

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: (FakeElement | string)[] = [];
  textContent = "";
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

  descendants(): FakeElement[] {
    const nested = this.children.filter((child): child is FakeElement => typeof child !== "string");
    return [...nested, ...nested.flatMap((child) => child.descendants())];
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function draw() {
  vi.stubGlobal("document", {
    createElementNS: (_namespace: string, tag: string) => new FakeElement(tag),
  });
  const document = starDocument({
    assemblies: ["a"],
    bodies: [
      ["frame", "a"],
      ["slide", "a"],
      ["loose", "a"],
    ],
    joints: [
      {
        id: "lift",
        parent: bodyEndpoint("frame"),
        child: bodyEndpoint("slide"),
        type: "prismatic",
      },
    ],
    drivenJoints: ["lift"],
  });
  const layout = layoutJointStar(buildJointStarForest(document));
  const drawn = drawJointStar(layout, createTranslator("en"));
  const attribute = (element: unknown, name: string) =>
    (element as FakeElement).attributes.get(name);
  return { drawn, attribute, root: drawn.svg as unknown as FakeElement };
}

describe("drawJointStar", () => {
  it("draws a focusable node per layout node, named for a screen reader", () => {
    const { drawn, attribute } = draw();
    expect([...drawn.nodes.keys()]).toEqual(["world", "body:frame", "body:slide"]);
    expect(attribute(drawn.nodes.get("world")?.group, "aria-label")).toContain("World");
    const slide = drawn.nodes.get("body:slide")?.group;
    expect(attribute(slide, "role")).toBe("button");
    expect(attribute(slide, "aria-label")).toBe(
      "Body slide, linked to its parent by the joint lift, Prismatic (slider)",
    );
    expect(attribute(slide, "data-focus")).toBe("body:slide");
  });

  it("counts the bodies that follow World in its name", () => {
    const { drawn, attribute } = draw();
    expect(attribute(drawn.nodes.get("world")?.group, "aria-label")).toContain(
      "following bodies: 1",
    );
  });

  it("gives a joint edge a name, a glyph, a bolt when driven and a label, and no other edge", () => {
    const { drawn, attribute } = draw();
    const lift = drawn.edges.get("body:slide")?.group as unknown as FakeElement;
    expect(attribute(lift, "aria-label")).toBe(
      "Joint lift, Prismatic (slider), from frame to slide, moved by an actuator",
    );
    const classes = lift.descendants().map((child) => child.attributes.get("class") ?? "");
    expect(classes).toContain("joint-star-glyph joint-star-glyph--prismatic");
    expect(classes).toContain("joint-star-glyph joint-star-glyph--bolt");
    const anchor = drawn.edges.get("body:frame")?.group;
    expect(attribute(anchor, "aria-hidden")).toBe("true");
    expect(attribute(anchor, "role")).toBeUndefined();
  });
});

describe("drawJointStar, lines and positions", () => {
  it("writes the line style of the joint type on the line", () => {
    const { drawn } = draw();
    const lift = drawn.edges.get("body:slide")?.group as unknown as FakeElement;
    const line = lift
      .descendants()
      .find((child) => child.attributes.get("class") === "joint-star-edge__line");
    expect(line?.attributes.get("stroke-dasharray")).toBe("10 5");
    expect(line?.attributes.get("stroke-width")).toBe("2");
  });

  it("moves nodes and curves with the viewport, never scaling the marks", () => {
    const { drawn, attribute } = draw();
    drawn.project({ scaleX: 2, scaleY: 2, translateX: 10, translateY: 20 });
    const slide = drawn.nodes.get("body:slide");
    const transform = attribute(slide?.group, "transform") ?? "";
    expect(transform).toMatch(/^translate\(/);
    expect(transform).not.toContain("scale");
    const lift = drawn.edges.get("body:slide")?.group as unknown as FakeElement;
    const curve = lift
      .descendants()
      .find((child) => child.attributes.get("class") === "joint-star-edge__line");
    expect(curve?.attributes.get("d")).toMatch(/^M [\d.-]+ [\d.-]+ C /);
    const marks = lift
      .descendants()
      .find((child) => child.attributes.get("class") === "joint-star-edge__marks");
    expect(marks?.attributes.get("transform")).toMatch(/^translate\(/);
  });

  it("gives a node with following bodies a toggle that says folded or unfolded", () => {
    vi.stubGlobal("document", {
      createElementNS: (_namespace: string, tag: string) => new FakeElement(tag),
    });
    const layout = layoutJointStar(
      buildJointStarForest(starDocument({ assemblies: ["a"], bodies: [["one", "a"]] })),
    );
    const drawn = drawJointStar(layout, createTranslator("en"));
    const world = drawn.nodes.get("world")?.group as unknown as FakeElement;
    const toggle = world
      .descendants()
      .find((child) => child.attributes.get("data-toggle-id") === "world");
    expect(toggle?.attributes.get("aria-hidden")).toBe("true");
    const count = toggle?.descendants().find((child) => child.tag === "text");
    expect(count?.children).toEqual(["1"]);
  });
});
