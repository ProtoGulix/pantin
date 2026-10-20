import { describe, expect, it } from "vitest";
import { createPrinter, type PrintPorts, restoreTheme, stripScreenState } from "./diagram-print.ts";

function recordingPorts(calls: string[]): { ports: PrintPorts; finishPrinting: () => void } {
  let afterPrint: () => void = () => undefined;
  return {
    ports: {
      prepare: () => {
        calls.push("prepare");
        return () => calls.push("restore");
      },
      print: () => calls.push("print"),
      onceAfterPrint: (listener) => {
        afterPrint = listener;
      },
    },
    finishPrinting: () => afterPrint(),
  };
}

describe("printing the diagram", () => {
  it("puts the sheet in place, prints, and restores the page only once printing is over", () => {
    const calls: string[] = [];
    const { ports, finishPrinting } = recordingPorts(calls);
    createPrinter()(ports);
    expect(calls).toEqual(["prepare", "print"]);
    finishPrinting();
    expect(calls).toEqual(["prepare", "print", "restore"]);
  });

  it("ignores a second print until the first one is over, then prints again", () => {
    const calls: string[] = [];
    const first = recordingPorts(calls);
    const print = createPrinter();
    print(first.ports);
    print(recordingPorts(calls).ports);
    expect(calls).toEqual(["prepare", "print"]);
    first.finishPrinting();
    print(recordingPorts(calls).ports);
    expect(calls).toEqual(["prepare", "print", "restore", "prepare", "print"]);
  });
});

describe("the theme after printing", () => {
  it("goes back to the previous theme", () => {
    const root: { dataset: { theme?: string | undefined } } = { dataset: { theme: "light" } };
    restoreTheme(root, "dark");
    expect(root.dataset.theme).toBe("dark");
  });

  it("is removed when the page had no theme", () => {
    const root: { dataset: { theme?: string | undefined } } = { dataset: { theme: "light" } };
    restoreTheme(root, undefined);
    expect("theme" in root.dataset).toBe(false);
  });
});

// A minimal node: classes, children found by class, and removal.
class FakeNode {
  removed = false;
  readonly classes: Set<string>;
  private readonly children: FakeNode[];
  constructor(classes: string[], children: FakeNode[] = []) {
    this.classes = new Set(classes);
    this.children = children;
  }
  readonly classList = { remove: (token: string) => this.classes.delete(token) };
  remove(): void {
    this.removed = true;
  }
  querySelectorAll(selector: string): FakeNode[] {
    const name = selector.slice(1);
    return this.children.filter((child) => child.classes.has(name));
  }
}

describe("the copy that is printed", () => {
  it("loses the selection, the focus dimming, the matches and the link remove button", () => {
    const selected = new FakeNode(["is-selected", "is-match", "keep"]);
    const related = new FakeNode(["is-related"]);
    const removeButton = new FakeNode(["diagram-edge-remove"]);
    const svg = new FakeNode(["diagram__svg", "diagram--focus"], [selected, related, removeButton]);
    stripScreenState(svg);
    expect([...svg.classes]).toEqual(["diagram__svg"]);
    expect([...selected.classes]).toEqual(["keep"]);
    expect(related.classes.size).toBe(0);
    expect(removeButton.removed).toBe(true);
  });
});
