import { afterEach, describe, expect, it, vi } from "vitest";
import { glyphThenText } from "./state-glyph.ts";

// There is no DOM in the test environment: a minimal document records what is built.

interface FakeNode {
  tag: string;
  attributes: Map<string, string>;
  children: FakeNode[];
  text?: string;
  setAttribute(name: string, value: string): void;
  append(child: FakeNode): void;
}

function fakeNode(tag: string): FakeNode {
  const node: FakeNode = {
    tag,
    attributes: new Map(),
    children: [],
    setAttribute: (name, value) => node.attributes.set(name, value),
    append: (child) => node.children.push(child),
  };
  return node;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("glyphThenText", () => {
  it("puts the small silent glyph of the state before the text", () => {
    vi.stubGlobal("document", {
      createElementNS: (_namespace: string, tag: string) => fakeNode(tag),
      createTextNode: (text: string) => ({ ...fakeNode("#text"), text }),
    });
    // Cast: the stubbed document builds FakeNode objects where the DOM would build Nodes.
    const [glyph, text] = glyphThenText("error", "Port already used") as unknown as FakeNode[];
    expect(glyph?.tag).toBe("svg");
    expect(glyph?.attributes.get("class")).toContain("icon--small");
    expect(glyph?.attributes.get("aria-hidden")).toBe("true");
    expect(text?.text).toBe("Port already used");
  });
});
