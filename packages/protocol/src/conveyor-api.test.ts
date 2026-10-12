import { describe, expect, it } from "vitest";
import { PoseResponseSchema } from "./api.ts";
import {
  CreateBeltRequestSchema,
  CreateEmitterRequestSchema,
  CreatePresenceSensorRequestSchema,
} from "./conveyor-api.ts";

// Request and response contracts of ADR 0043 point 12.

const IDENTITY = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };

describe("create requests", () => {
  it("leave out the id the core derives, and the tag key of an emitter", () => {
    const emitter = CreateEmitterRequestSchema.parse({
      id: "mine",
      tagKey: "mine",
      name: "Source",
      assembly: "main",
      placement: IDENTITY,
      box: { size: [0.1, 0.1, 0.1], mass: 1, material: "cardboard" },
    });
    expect(emitter).not.toHaveProperty("id");
    expect(emitter).not.toHaveProperty("tagKey");
  });

  it("refuse a belt without a positive length", () => {
    const belt = {
      name: "Belt",
      assembly: "main",
      placement: IDENTITY,
      width: 0.4,
      drumJoint: "drum",
      drumRadius: 0.05,
    };
    expect(CreateBeltRequestSchema.safeParse({ ...belt, length: 1 }).success).toBe(true);
    expect(CreateBeltRequestSchema.safeParse({ ...belt, length: 0 }).success).toBe(false);
    expect(CreateBeltRequestSchema.safeParse(belt).success).toBe(false);
  });

  it("take a presence sensor by its type's fields", () => {
    const cell = {
      name: "Cell",
      assembly: "main",
      placement: IDENTITY,
      type: "photoelectric",
      mode: "diffuse",
      range: 0.6,
      normallyClosed: false,
      onDelay: 0,
      offDelay: 0,
    };
    expect(CreatePresenceSensorRequestSchema.safeParse(cell).success).toBe(true);
    expect(CreatePresenceSensorRequestSchema.safeParse({ ...cell, type: "radar" }).success).toBe(
      false,
    );
  });
});

describe("PoseResponseSchema", () => {
  it("requires the products, in the fields a client draws", () => {
    const pose = { jointPositions: [], bodies: [], objects: [] };
    expect(PoseResponseSchema.safeParse(pose).success).toBe(false);
    const product = {
      productId: "p1",
      emitterId: "source",
      size: [0.1, 0.1, 0.1],
      material: "cardboard",
      translation: [0, 0, 0.05],
      rotation: [0, 0, 0, 1],
    };
    expect(PoseResponseSchema.parse({ ...pose, products: [product] }).products).toEqual([product]);
    expect(
      PoseResponseSchema.safeParse({ ...pose, products: [{ ...product, material: "x" }] }).success,
    ).toBe(false);
  });

  it("requires the world poses of the objects", () => {
    const object = { kind: "belt", id: "feed", translation: [0, 0, 0], rotation: [0, 0, 0, 1] };
    const pose = { jointPositions: [], bodies: [], products: [] };
    expect(PoseResponseSchema.safeParse(pose).success).toBe(false);
    expect(PoseResponseSchema.safeParse({ ...pose, objects: [object] }).success).toBe(true);
    expect(
      PoseResponseSchema.safeParse({ ...pose, objects: [{ ...object, kind: "robot" }] }).success,
    ).toBe(false);
  });
});
