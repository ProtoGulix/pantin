import { afterEach, describe, expect, it, vi } from "vitest";
import { wiringDiagram, wiringDocument } from "../diagram/diagram-wiring-fixtures.ts";
import { listenToLinkDrags } from "./diagram-drag.ts";
import type { DrawnDiagram } from "./diagram-draw.ts";

// Escape during a wiring (ADR 0039 point 6): the first Escape only abandons the
// wiring, the window shortcuts must not also turn the tool off. The viewer tests
// run in Node, so a small fake document dispatches keys capture phase first.

type Listener = (event: FakeKeyEvent) => void;

interface FakeKeyEvent {
  key: string;
  stopped: boolean;
  stopImmediatePropagation(): void;
}

class FakeDocument {
  private readonly listeners: { listener: Listener; capture: boolean }[] = [];

  addEventListener(_type: string, listener: Listener, options?: { capture?: boolean }): void {
    this.listeners.push({ listener, capture: options?.capture === true });
  }

  removeEventListener(_type: string, listener: Listener, options?: { capture?: boolean }): void {
    const capture = options?.capture === true;
    const index = this.listeners.findIndex(
      (entry) => entry.listener === listener && entry.capture === capture,
    );
    if (index >= 0) {
      this.listeners.splice(index, 1);
    }
  }

  pressEscape(): void {
    const event: FakeKeyEvent = {
      key: "Escape",
      stopped: false,
      stopImmediatePropagation() {
        this.stopped = true;
      },
    };
    const ordered = [
      ...this.listeners.filter((entry) => entry.capture),
      ...this.listeners.filter((entry) => !entry.capture),
    ];
    for (const { listener } of ordered) {
      if (!event.stopped) {
        listener(event);
      }
    }
  }

  createElementNS(): FakeElement {
    return new FakeElement({});
  }

  elementFromPoint(): null {
    return null;
  }
}

class FakeElement {
  readonly classList = { add: vi.fn(), remove: vi.fn() };
  private readonly attributes: Record<string, string>;

  constructor(attributes: Record<string, string>) {
    this.attributes = attributes;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  // Every test element answers for itself: selectors look like "[data-node-id]".
  closest(selector: string): FakeElement | null {
    const name = selector.slice(1, -1);
    return name in this.attributes ? this : null;
  }

  append(): void {}
  remove(): void {}
  setPointerCapture(): void {}
  querySelectorAll(): FakeElement[] {
    return [];
  }
  getBoundingClientRect() {
    return { left: 0, top: 0 };
  }
  addEventListener(_type: string, _handler: unknown): void {}
}

const fakeDocument = new FakeDocument();

afterEach(() => {
  vi.unstubAllGlobals();
});

function startWiring() {
  vi.stubGlobal("document", fakeDocument);
  vi.stubGlobal("Element", FakeElement);
  const svg = new FakeElement({});
  const handlers = new Map<string, (event: unknown) => void>();
  svg.addEventListener = (type, handler) => {
    handlers.set(type, handler as (event: unknown) => void);
  };
  const drawn = { svg, nodes: new Map(), edges: new Map(), focusables: new Map() };
  // The casts below: the fakes only implement what the drag touches.
  listenToLinkDrags(
    svg as unknown as SVGElement,
    {
      model: () => ({
        shown: true,
        document: wiringDocument,
        diagram: wiringDiagram,
        typeLabels: new Map(),
        highlight: new Map(),
        filter: "",
        matches: new Set<string>(),
        empty: false,
        translate: (key: string) => key,
      }),
      drawn: () => drawn as unknown as DrawnDiagram,
      intents: () => null,
    } as never,
  );
  const source = new FakeElement({ "data-node-id": "drive:v1", "data-socket-id": "out:port_2" });
  const pointer = (x: number) => ({
    button: 0,
    pointerId: 1,
    clientX: x,
    clientY: 0,
    target: source,
  });
  handlers.get("pointerdown")?.(pointer(0));
  handlers.get("pointermove")?.(pointer(20));
}

describe("Escape during a wiring", () => {
  it("abandons the wiring without reaching the document shortcuts, then lets the next one through", () => {
    const documentShortcut = vi.fn();
    fakeDocument.addEventListener("keydown", documentShortcut);
    startWiring();

    fakeDocument.pressEscape();
    expect(documentShortcut).not.toHaveBeenCalled();

    fakeDocument.pressEscape();
    expect(documentShortcut).toHaveBeenCalledTimes(1);
    fakeDocument.removeEventListener("keydown", documentShortcut);
  });
});
