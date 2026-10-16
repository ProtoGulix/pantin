import { describe, expect, it } from "vitest";
import { newAlignmentSession } from "../alignment/alignment-session.ts";
import { initialViewerState } from "../viewer-state.ts";
import { escapeCommand } from "./menu-context.ts";

// The last link of the Escape chain (ADR 0039 point 6).

const idle = initialViewerState("fr");

describe("escapeCommand", () => {
  it("does nothing while no tool is on", () => {
    expect(escapeCommand(idle)).toBeNull();
  });

  it("turns a gizmo or an alignment off", () => {
    expect(escapeCommand({ ...idle, gizmoMode: "move" })).toBe("turnToolOff");
    expect(escapeCommand({ ...idle, alignment: newAlignmentSession("press", "main") })).toBe(
      "turnToolOff",
    );
  });

  it("leaves an open context menu to close first", () => {
    const menu = { nodeId: "pantin:press", x: 0, y: 0 };
    expect(escapeCommand({ ...idle, gizmoMode: "rotate", contextMenu: menu })).toBeNull();
  });
});
