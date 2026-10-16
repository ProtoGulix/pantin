import type { PoseSnapshot } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { objectsAsPoseSnapshot, productsAsPoseSnapshot } from "./pose-feed.ts";

const SNAPSHOT: PoseSnapshot = {
  stepCount: 3,
  jointPositions: [{ jointId: "j", position: 1 }],
  bodies: [{ bodyId: "rail", translation: [0, 0, 0], rotation: [0, 0, 0, 1] }],
  products: [
    {
      productId: "p1",
      emitterId: "emitter",
      size: [0.2, 0.2, 0.2],
      material: "cardboard",
      translation: [1, 2, 3],
      rotation: [0, 0, 0, 1],
    },
  ],
  objects: [{ kind: "presenceSensor", id: "cell", translation: [4, 5, 6], rotation: [0, 0, 0, 1] }],
};

describe("productsAsPoseSnapshot", () => {
  it("lists the products as body poses and nothing else", () => {
    const poses = productsAsPoseSnapshot(SNAPSHOT);
    expect(poses.bodies).toEqual([
      { bodyId: "p1", translation: [1, 2, 3], rotation: [0, 0, 0, 1] },
    ]);
    expect(poses.products).toEqual([]);
    expect(poses.objects).toEqual([]);
    expect(poses.stepCount).toBe(3);
  });
});

describe("objectsAsPoseSnapshot", () => {
  it("lists the objects as body poses keyed kind:id", () => {
    const poses = objectsAsPoseSnapshot(SNAPSHOT);
    expect(poses.bodies).toEqual([
      { bodyId: "presenceSensor:cell", translation: [4, 5, 6], rotation: [0, 0, 0, 1] },
    ]);
    expect(poses.products).toEqual([]);
  });
});
