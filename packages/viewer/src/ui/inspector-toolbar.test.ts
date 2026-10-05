import { afterEach, describe, expect, it, vi } from "vitest";
import type { Translate } from "../i18n/translate.ts";
import type { InspectorView } from "../inspector/inspector-model.ts";
import type { PositioningView } from "../inspector/positioning-view.ts";
import { renderInspectorToolbar } from "./inspector-toolbar.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The viewer's tests run without a DOM: a minimal stand-in records the tree.

class FakeNode {
  className = "";
  textContent = "";
  disabled = false;
  title = "";
  readonly attributes = new Map<string, string>();
  readonly children: FakeNode[] = [];
  readonly tag: string;
  constructor(tag: string) {
    this.tag = tag;
  }
  append(child: FakeNode): void {
    this.children.push(child);
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  addEventListener(): void {}
}

afterEach(() => vi.unstubAllGlobals());

// Every message shows as its key and its parameters, so that the test reads
// which one is used.
const t = ((key: string, parameters?: Record<string, string>) =>
  parameters === undefined ? key : `${key}(${Object.values(parameters).join(", ")})`) as Translate;

const positioning: PositioningView = {
  title: "Positionnement",
  group: null,
  bodyLine: null,
  tools: [
    { command: "gizmoMove", label: "move", pressed: true, disabled: false },
    { command: "gizmoRotate", label: "rotate", pressed: false, disabled: false },
    { command: "gizmoSpace", label: "space", pressed: true, disabled: false },
    { command: "align", label: "align", pressed: false, disabled: false },
  ],
  step: { field: "translationMillimetres", label: "step", value: "10" },
  restore: { label: "restore", title: "restore", disabled: false },
  alignment: null,
};

function render(view: Partial<InspectorView>): FakeNode[] {
  vi.stubGlobal("document", {
    createElement: (tag: string) => new FakeNode(tag),
    createElementNS: (_namespace: string, tag: string) => new FakeNode(tag),
  });
  const base = { device: null, positioning: null, canCreateActuator: true, canCreateSensor: true };
  // Only the fields the tool bar reads; the rest of the view is not used.
  const full = { ...base, ...view } as InspectorView;
  // The fake document returns FakeNode trees in place of DOM elements.
  const bar = renderInspectorToolbar(full, t, {} as PanelIntents) as unknown as FakeNode;
  return bar.children;
}

function labelsOf(items: FakeNode[]): string[] {
  return items.map((item) =>
    item.tag === "span" ? "|" : (item.attributes.get("aria-label") ?? item.tag),
  );
}

describe("the inspector tool bar", () => {
  it("offers only the creation tools when nothing can be placed or edited", () => {
    expect(labelsOf(render({}))).toEqual(["drives.new", "actuators.new", "sensors.new"]);
  });

  it("puts creation, positioning and device tools in one row, separated", () => {
    const items = render({ positioning, device: { kind: "drive", id: "Com_Verin" } });
    expect(labelsOf(items)).toEqual([
      "drives.new",
      "actuators.new",
      "sensors.new",
      "|",
      "move",
      "rotate",
      "space",
      "align",
      "step",
      "restore",
      "|",
      "drives.edit",
      "drives.delete",
    ]);
  });

  it("shows why the restore button is off in its tooltip", () => {
    const off = { label: "restore", title: "restore: no edit", disabled: true };
    const items = render({ positioning: { ...positioning, restore: off } });
    const button = items.find((item) => item.attributes.get("aria-label") === "restore");
    expect(button?.disabled).toBe(true);
    expect(button?.title).toBe("restore: no edit");
  });

  it("marks the tool that is on as pressed", () => {
    const pressed = render({ positioning })
      .filter((item) => item.attributes.get("aria-pressed") === "true")
      .map((item) => item.attributes.get("aria-label"));
    expect(pressed).toEqual(["move", "space"]);
  });

  it("says in the tooltip why an actuator or a sensor cannot be created", () => {
    const [, actuator, sensor] = render({ canCreateActuator: false, canCreateSensor: false });
    expect(actuator?.disabled).toBe(true);
    expect(sensor?.disabled).toBe(true);
    expect(actuator?.title).toBe("inspector.disabledTool(actuators.new, actuators.noMovableJoint)");
  });
});
