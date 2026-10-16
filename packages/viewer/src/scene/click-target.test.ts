import { describe, expect, it } from "vitest";
import { clickTargetOf } from "./click-target.ts";

// Meshes are plain strings here: the decision does not look inside them.

const bodies = new Map([["rail-mesh", "rail"]]);
const conveyors = new Map([
  ["slab-mesh", "belt:feed"],
  ["odd-mesh", "not a key"],
]);
const keyOf = (mesh: string) => conveyors.get(mesh) ?? null;

describe("clickTargetOf", () => {
  it("selects the body when the nearest hit is a body, whatever lies behind it", () => {
    expect(clickTargetOf("rail-mesh", bodies, keyOf)).toEqual({ kind: "body", bodyId: "rail" });
  });

  it("selects the object when the nearest hit is one of its meshes", () => {
    expect(clickTargetOf("slab-mesh", bodies, keyOf)).toEqual({
      kind: "conveyor",
      conveyor: { kind: "belt", id: "feed" },
    });
  });

  it("is nothing for the background and for a mesh that is neither", () => {
    expect(clickTargetOf(null, bodies, keyOf)).toEqual({ kind: "nothing" });
    expect(clickTargetOf("ground", bodies, keyOf)).toEqual({ kind: "nothing" });
    expect(clickTargetOf("odd-mesh", bodies, keyOf)).toEqual({ kind: "nothing" });
  });
});
