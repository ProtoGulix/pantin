import { describe, expect, it } from "vitest";
import { nodeSelection, selectedDeviceOf, selectedNodeIdOf } from "./selection.ts";

describe("the selection union", () => {
  it("is a node, a device or nothing, and each reader sees only its own kind", () => {
    const node = nodeSelection("pantin:press");
    const device = { kind: "sensor", id: "e1" } as const;
    expect([selectedNodeIdOf(node), selectedDeviceOf(node)]).toEqual(["pantin:press", null]);
    expect([selectedNodeIdOf(device), selectedDeviceOf(device)]).toEqual([null, device]);
    expect([selectedNodeIdOf(null), selectedDeviceOf(null)]).toEqual([null, null]);
  });

  it("turns a null node id into no selection", () => {
    expect(nodeSelection(null)).toBeNull();
  });
});
