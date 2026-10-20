import type { Body } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { coreToBabylonPosition, type QuaternionTuple, type Vector3Tuple } from "../frames.ts";
import {
  bodyHighlight,
  bodyRenderKey,
  chooseGridStep,
  faceSideLook,
  floorHeight,
  forgetFailedLoads,
  frameBounds,
  isCurrentLoad,
  isOutlined,
  outlineWidthInMeshSpace,
  overlayAlphaFor,
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

describe("failed mesh load", () => {
  it("is not retried while its key is kept, and retried once the key changes", () => {
    const initial = body("b1", "mm");
    const wanted = new Map([[initial.id, bodyRenderKey("p", initial)]]);
    expect(planSceneSync(wanted, "p", [initial]).bodiesToLoad).toEqual([]);
    expect(planSceneSync(wanted, "p", [body("b1", "m")]).bodiesToLoad).toHaveLength(1);
  });

  it("is planned again once the failed bodies are forgotten, and only those", () => {
    const failed = body("b1", "mm");
    const loaded = body("b2", "mm");
    const wanted = new Map([
      [failed.id, bodyRenderKey("p", failed)],
      [loaded.id, bodyRenderKey("p", loaded)],
    ]);
    const failedIds = new Set([failed.id]);
    forgetFailedLoads(wanted, failedIds);
    expect(planSceneSync(wanted, "p", [failed, loaded]).bodiesToLoad).toEqual([failed]);
    expect(failedIds.size).toBe(0);
  });

  it("ignores a result whose key was replaced while it ran", () => {
    const wanted = new Map([["b1", "new"]]);
    expect(isCurrentLoad(wanted, "b1", "new")).toBe(true);
    expect(isCurrentLoad(wanted, "b1", "old")).toBe(false);
    expect(isCurrentLoad(wanted, "gone", "old")).toBe(false);
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

describe("floorHeight", () => {
  it("stays at z = 0 under bodies standing above it", () => {
    expect(floorHeight(0.25)).toBe(0);
  });

  it("drops to the lowest point of bodies going below z = 0", () => {
    expect(floorHeight(-0.02)).toBe(-0.02);
  });

  it("stays at z = 0 without bodies", () => {
    expect(floorHeight(Infinity)).toBe(0);
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
    parentBodyIds: new Set(["rail", "base"]),
    childBodyIds: new Set(["carriage", "motor"]),
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
    expect(bodyHighlight("motor", new Set(), preview)).toBe("child");
    expect(bodyHighlight("base", new Set(["base"]), preview)).toBe("parent");
    expect(bodyHighlight("other", new Set(["other"]), preview)).toBeNull();
  });

  it("lets the child win when a joint holds a body at both ends", () => {
    expect(bodyHighlight("rail", new Set(), { ...preview, childBodyIds: new Set(["rail"]) })).toBe(
      "child",
    );
  });
});

describe("outlineWidthInMeshSpace", () => {
  it("gives the same thickness in metres whatever the body's unit scale", () => {
    const millimetres = outlineWidthInMeshSpace(0.4, 0.001) * 0.001;
    const metres = outlineWidthInMeshSpace(0.4, 1);
    expect(millimetres).toBeCloseTo(metres);
  });

  it("follows the body's size within a visible range", () => {
    expect(outlineWidthInMeshSpace(0.4, 1)).toBeCloseTo(0.006);
    expect(outlineWidthInMeshSpace(0.001, 1)).toBe(0.0015);
    expect(outlineWidthInMeshSpace(50, 1)).toBe(0.02);
  });

  it("falls back to the raw thickness without a usable scale", () => {
    expect(outlineWidthInMeshSpace(0.4, 0)).toBeCloseTo(0.006);
  });
});

describe("overlayAlphaFor", () => {
  it("tints the parent more strongly than the child, and the child more than a selection", () => {
    expect(overlayAlphaFor("parent")).toBeGreaterThan(overlayAlphaFor("child"));
    expect(overlayAlphaFor("child")).toBeGreaterThan(overlayAlphaFor("selected"));
  });
});

describe("isOutlined", () => {
  it("outlines a selected body and a joint's child, not a joint's parent", () => {
    expect(isOutlined("selected")).toBe(true);
    expect(isOutlined("child")).toBe(true);
    expect(isOutlined("parent")).toBe(false);
  });
});

describe("faceSideLook", () => {
  it("tints the moving face with the selection and outlines it", () => {
    expect(faceSideLook("moving")).toEqual({ colour: "selection", outlined: true });
  });

  it("tints the target face with the joint parent colour and no outline", () => {
    expect(faceSideLook("target")).toEqual({ colour: "jointParent", outlined: false });
  });
});
