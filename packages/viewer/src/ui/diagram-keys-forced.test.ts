import { afterEach, describe, expect, it, vi } from "vitest";
import { wiringDiagram, wiringDocument } from "../diagram/diagram-wiring-fixtures.ts";
import { createTranslator } from "../i18n/translate.ts";
import { listenToDiagramKeys } from "./diagram-keys.ts";

// The menu key on a command socket offers to release it while its tag is forced.

class FakeElement {
  private readonly attributes: Record<string, string>;
  constructor(attributes: Record<string, string>) {
    this.attributes = attributes;
  }
  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }
  closest(selector: string): FakeElement | null {
    const attribute = selector.slice(1, -1);
    return attribute in this.attributes ? this : null;
  }
}

afterEach(() => vi.unstubAllGlobals());

function pressMenuKey(socketId: string, forced: string[]) {
  vi.stubGlobal("Element", FakeElement);
  let onKey: (event: unknown) => void = () => undefined;
  const svg = { addEventListener: (_name: string, handler: typeof onKey) => (onKey = handler) };
  const openMenu = vi.fn();
  const intents = { releaseTag: vi.fn() };
  const model = {
    shown: true as const,
    document: wiringDocument,
    diagram: wiringDiagram,
    typeLabels: new Map<string, string>(),
    highlight: new Map(),
    empty: false,
    translate: createTranslator("fr"),
  };
  listenToDiagramKeys(svg as unknown as SVGElement, {
    model: () => model,
    intents: () => intents as never,
    forcedTags: () => new Set(forced),
    focusKey: () => undefined,
    openValueInput: () => undefined,
    selectedEdgeId: () => null,
    clearEdgeSelection: () => undefined,
    openMenu,
  });
  const item = new FakeElement({
    "data-focus": "port",
    "data-node-id": "drive:v1",
    "data-socket-id": socketId,
  });
  const event = { key: "ContextMenu", target: item, preventDefault: vi.fn() };
  onKey({ ...event, ctrlKey: false, altKey: false, metaKey: false });
  return { openMenu, intents, prevented: event.preventDefault };
}

describe("the menu key on a command socket", () => {
  it("offers Release for a forced tag, and releasing calls releaseTag with the tag", () => {
    const { openMenu, intents, prevented } = pressMenuKey("tag:coil_14", ["a.v1.coil_14"]);
    expect(prevented).toHaveBeenCalled();
    const [, titleKey, choices, choose] = openMenu.mock.calls[0] ?? [];
    expect(titleKey).toBe("diagram.menu.releaseTitle");
    expect(choices).toEqual([
      { endpoint: { nodeId: "drive:v1", socketId: "tag:coil_14" }, label: "Relâcher" },
    ]);
    choose(choices[0]);
    expect(intents.releaseTag).toHaveBeenCalledWith("a.v1.coil_14");
  });

  it("opens nothing for a command that is not forced", () => {
    expect(pressMenuKey("tag:coil_14", []).openMenu).not.toHaveBeenCalled();
  });
});
