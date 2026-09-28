import type { Body } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { bodyRenderKey, chooseGridStep, frameBounds, planSceneSync } from "./scene-plan.ts";

function body(id: string, unit: Body["source"]["unit"] = "mm"): Body {
  return {
    id,
    name: id,
    source: { fileName: `${id}.stl`, format: "stl", unit, upAxis: "z", nodes: [] },
    mesh: `meshes/${id}.stl`,
  };
}

describe("planSceneSync", () => {
  it("loads every body of a freshly opened Pantin", () => {
    const plan = planSceneSync(new Map(), "press", [body("a"), body("b")]);
    expect(plan.bodiesToLoad.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(plan.bodyIdsToRemove).toEqual([]);
  });

  it("does nothing when nothing changed, even after a rename", () => {
    const loaded = new Map([["a", bodyRenderKey("press", body("a"))]]);
    const plan = planSceneSync(loaded, "press", [{ ...body("a"), name: "Renamed" }]);
    expect(plan).toEqual({ bodiesToLoad: [], bodyIdsToRemove: [] });
  });

  it("reloads a body whose unit changed", () => {
    const loaded = new Map([["a", bodyRenderKey("press", body("a", "mm"))]]);
    const plan = planSceneSync(loaded, "press", [body("a", "cm")]);
    expect(plan.bodyIdsToRemove).toEqual(["a"]);
    expect(plan.bodiesToLoad.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("replaces everything when another Pantin opens, even with the same body ids", () => {
    const loaded = new Map([["a", bodyRenderKey("press", body("a"))]]);
    const plan = planSceneSync(loaded, "robot", [body("a")]);
    expect(plan.bodyIdsToRemove).toEqual(["a"]);
    expect(plan.bodiesToLoad.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("clears the scene when no Pantin is open", () => {
    const loaded = new Map([["a", bodyRenderKey("press", body("a"))]]);
    expect(planSceneSync(loaded, null, [])).toEqual({ bodiesToLoad: [], bodyIdsToRemove: ["a"] });
  });
});

describe("frameBounds", () => {
  it("targets the box centre", () => {
    expect(frameBounds([0, 0, 0], [2, 4, 6], Math.PI / 3).target).toEqual([1, 2, 3]);
  });

  it("backs off far enough to see the bounding sphere", () => {
    const framing = frameBounds([-1, -1, -1], [1, 1, 1], Math.PI / 2);
    expect(framing.radius).toBeGreaterThan(Math.sqrt(3) / Math.sin(Math.PI / 4));
  });

  it("falls back to a default view for an empty box", () => {
    const empty = frameBounds([Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity], 1);
    expect(empty.target).toEqual([0, 0, 0]);
  });
});

describe("chooseGridStep", () => {
  it.each([
    [1, 0.1],
    [2.4, 0.2],
    [0.05, 0.005],
    [12, 1],
    [40, 5],
  ])("extent %d m gives a %d m step", (extent, step) => {
    expect(chooseGridStep(extent)).toBeCloseTo(step, 12);
  });
});
