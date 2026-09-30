import type { Body } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { coreToBabylonPosition, type QuaternionTuple, type Vector3Tuple } from "../frames.ts";
import {
  bodyHighlight,
  bodyRenderKey,
  chooseGridStep,
  frameBounds,
  placeJointArrow,
  planSceneSync,
} from "./scene-plan.ts";

function body(id: string, unit: Body["source"]["unit"] = "mm"): Body {
  return {
    id,
    name: id,
    assembly: "main",
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

// Rotates v by the unit quaternion q (v' = q v q*), expanded.
function rotate([qx, qy, qz, qw]: QuaternionTuple, [vx, vy, vz]: Vector3Tuple): Vector3Tuple {
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

describe("placeJointArrow", () => {
  const directions: Vector3Tuple[] = [
    [1, 0, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
    [1, 2, -2],
  ];

  it.each(directions)("points Babylon's +Y along the core axis (%s)", (...axis) => {
    const placement = placeJointArrow([0, 0, 0], axis, 1);
    const expected = coreToBabylonPosition(axis);
    const norm = Math.hypot(...expected);
    const tip = rotate(placement.rotation, [0, 1, 0]);
    tip.forEach((component, index) => {
      expect(component).toBeCloseTo((expected[index] ?? 0) / norm, 9);
    });
  });

  it("starts at the origin, in Babylon coordinates", () => {
    expect(placeJointArrow([0.1, 0.2, 0.3], [0, 0, 1], 1).start).toEqual(
      coreToBabylonPosition([0.1, 0.2, 0.3]),
    );
  });

  it("scales with the child body, with a floor for tiny ones", () => {
    expect(placeJointArrow([0, 0, 0], [1, 0, 0], 0.4).length).toBeCloseTo(0.3);
    expect(placeJointArrow([0, 0, 0], [1, 0, 0], 0).length).toBe(0.02);
  });
});

describe("bodyHighlight", () => {
  const preview = {
    parentBodyId: "rail",
    childBodyId: "carriage",
    origin: null,
    axis: null,
    driven: false,
  };

  it("tints the selected body when no joint is previewed", () => {
    expect(bodyHighlight("rail", new Set(["rail"]), null)).toBe("selected");
    expect(bodyHighlight("carriage", new Set(["rail"]), null)).toBeNull();
  });

  it("tints the previewed joint's bodies instead of the selection", () => {
    expect(bodyHighlight("rail", new Set(["base"]), preview)).toBe("parent");
    expect(bodyHighlight("carriage", new Set(["base"]), preview)).toBe("child");
    expect(bodyHighlight("base", new Set(["base"]), preview)).toBeNull();
  });

  it("lets the child win when a joint links a body to itself", () => {
    expect(bodyHighlight("rail", new Set(), { ...preview, childBodyId: "rail" })).toBe("child");
  });
});
