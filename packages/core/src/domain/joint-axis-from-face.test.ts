import type { Assembly, Body, FaceFile, Joint, PantinDocument, Placement } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { ApiError } from "../errors.ts";
import { expectPoint } from "../test-support/expect-point.ts";
import { assembly, body, documentOf, joint } from "../test-support/placed-fixtures.ts";
import { jointAxisOfFace, type PickedFace, snapComponent } from "./joint-axis-from-face.ts";
import {
  add,
  apply,
  inverse,
  rotate,
  toPlacement,
  unitTransform,
  type Vector3,
} from "./rigid-transform.ts";

// Joint axis from a picked face (ADR 0041), in the frame of the joint's
// parent assembly.

const SINE_35 = Math.sin((70 * Math.PI) / 360);
const COSINE_35 = Math.cos((70 * Math.PI) / 360);
const ABOUT_Y_70: Placement = {
  translation: [0.4, -0.2, 0.7],
  rotation: [0, SINE_35, 0, COSINE_35],
};
const QUARTER_ABOUT_Z: Placement = {
  translation: [1, 0, 0],
  rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
};
const IDENTITY_PLACEMENT: Placement = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };
const NO_POSITIONS = new Map<string, number>();

function faces(...geometries: FaceFile["faces"]): FaceFile {
  return { formatVersion: 1, writer: "test", solid: true, primitives: [], faces: geometries };
}

const ROD_FACES = faces(
  { kind: "cylinder", point: [0.1, 0.2, 0], direction: [1, 0, 0], radius: 0.01 },
  { kind: "plane", point: [0, 0, 0.1], normal: [0, 0, -1] },
  { kind: "other" },
);

function documentWith(assemblies: Assembly[], bodies: Body[], joints: Joint[]): PantinDocument {
  return documentOf(joints, bodies, assemblies);
}

function requireJoint(document: PantinDocument, id: string): Joint {
  const found = document.joints.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error("Test joint missing.");
  }
  return found;
}

function run(document: PantinDocument, faceFile: FaceFile | undefined, pick: PickedFace) {
  return jointAxisOfFace(document, NO_POSITIONS, requireJoint(document, "j"), faceFile, pick);
}

describe("jointAxisOfFace", () => {
  it("gives [1, 0, 0] for a cylinder along the X of a sub-assembly turned 70 degrees about Y", () => {
    const document = documentWith(
      [
        assembly("sub", ABOUT_Y_70),
        assembly("world", { translation: [0, 0, 0], rotation: [0, 0, 0, 1] }),
      ],
      [body("rod", "sub"), body("slider", "world")],
      [joint({ id: "j", type: "prismatic", parent: "rod", child: "slider", limits: [0, 1] })],
    );
    const hit = apply(unitTransform(ABOUT_Y_70), [0.3, 0.25, 0.05]);
    const answer = run(document, ROD_FACES, { bodyId: "rod", faceIndex: 0, hitPoint: hit });
    expect(answer.axis).toEqual([1, 0, 0]);
    expectPoint(answer.origin, [0.3, 0.2, 0]);
  });

  it("converts a pick on a body of another assembly into the parent assembly frame", () => {
    const identity: Placement = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };
    const document = documentWith(
      [assembly("main", identity), assembly("sub", QUARTER_ABOUT_Z), assembly("tool", identity)],
      [body("frame", "main"), body("rod", "sub"), body("slider", "tool")],
      [joint({ id: "j", type: "prismatic", parent: "rod", child: "slider", limits: [0, 1] })],
    );
    const bore = faces({
      kind: "cylinder",
      point: [0.5, 0, 0.2],
      direction: [0, 1, 0],
      radius: 0.01,
    });
    const answer = run(document, bore, {
      bodyId: "frame",
      faceIndex: 0,
      hitPoint: [0.5, 0.3, 0.2],
    });
    expect(answer.axis).toEqual([1, 0, 0]);
    expectPoint(answer.origin, [0.3, 0.5, 0.2]);
  });
});

describe("jointAxisOfFace on a STEP body", () => {
  it("reads the cylinder in the sub-assembly frame when the body placement is the inverse of it", () => {
    const world = unitTransform(ABOUT_Y_70);
    const placement = toPlacement(inverse(world));
    const document = documentWith(
      [assembly("sub", ABOUT_Y_70), assembly("tool", IDENTITY_PLACEMENT)],
      [body("rod", "sub", placement), body("slider", "tool")],
      [joint({ id: "j", type: "prismatic", parent: "rod", child: "slider", limits: [0, 1] })],
    );
    // Face geometry in the mesh file frame, which the body placement turns
    // back: the cylinder axis there is R * [1, 0, 0].
    const direction = rotate(world.rotation, [1, 0, 0]);
    const point = apply(world, [0.1, 0.2, 0]);
    const file = faces({
      kind: "cylinder",
      point: [...point],
      direction: [...direction],
      radius: 0.01,
    });
    // The pose of the body is W * B = identity: the hit point is as in the file.
    const answer = run(document, file, { bodyId: "rod", faceIndex: 0, hitPoint: [...point] });
    expect(answer.axis.map(Math.abs)).toEqual([1, 0, 0]);
  });
});

describe("jointAxisOfFace on planes", () => {
  it("takes the outward normal of a plane and the hit point projected on it", () => {
    const document = documentWith(
      [assembly("sub", QUARTER_ABOUT_Z)],
      [body("rod", "sub"), body("slider", "sub")],
      [joint({ id: "j", type: "prismatic", parent: "rod", child: "slider", limits: [0, 1] })],
    );
    const hit = apply(unitTransform(QUARTER_ABOUT_Z), [0.05, 0.07, 0.3]);
    const answer = run(document, ROD_FACES, { bodyId: "rod", faceIndex: 1, hitPoint: hit });
    expect(answer.axis).toEqual([0, 0, -1]);
    expectPoint(answer.origin, [0.05, 0.07, 0.1]);
  });
});

describe("jointAxisOfFace with joints", () => {
  it("follows a parent body displaced by another joint", () => {
    const document = documentWith(
      [assembly("sub", ABOUT_Y_70)],
      [body("base", "sub"), body("rod", "sub"), body("tip", "sub")],
      [
        joint({
          id: "slide",
          type: "prismatic",
          parent: "base",
          child: "rod",
          axis: [1, 0, 0],
          limits: [0, 1],
        }),
        joint({ id: "j", type: "prismatic", parent: "rod", child: "tip", limits: [0, 1] }),
      ],
    );
    const positions = new Map([["slide", 0.2]]);
    const found = requireJoint(document, "j");
    // The rod is displayed 0.2 further along the sub-assembly X.
    const hit = apply(unitTransform(ABOUT_Y_70), [0.3, 0.25, 0.05]);
    const shifted = add(hit, rotate(ABOUT_Y_70.rotation, [0.2, 0, 0]));
    const answer = jointAxisOfFace(document, positions, found, ROD_FACES, {
      bodyId: "rod",
      faceIndex: 0,
      hitPoint: shifted,
    });
    expect(answer.axis).toEqual([1, 0, 0]);
    expectPoint(answer.origin, [0.3, 0.2, 0]);
  });
});

describe("jointAxisOfFace refusals", () => {
  it("refuses a body without face file, a missing face and a face of kind other", () => {
    const document = documentWith(
      [assembly("sub", ABOUT_Y_70)],
      [body("rod", "sub"), body("slider", "sub")],
      [joint({ id: "j", type: "prismatic", parent: "rod", child: "slider", limits: [0, 1] })],
    );
    const pick = (faceIndex: number) => ({
      bodyId: "rod",
      faceIndex,
      hitPoint: [0, 0, 0] as Vector3,
    });
    const code = (faceFile: FaceFile | undefined, faceIndex: number) => {
      try {
        run(document, faceFile, pick(faceIndex));
      } catch (error) {
        return error instanceof ApiError ? error.code : "other";
      }
      return "none";
    };
    expect(code(undefined, 0)).toBe("invalid_request");
    expect(code(ROD_FACES, 9)).toBe("not_found");
    expect(code(ROD_FACES, 2)).toBe("invalid_request");
  });
});

describe("snapComponent", () => {
  it("snaps within 1e-9 of 0, 1 and -1 only", () => {
    expect(snapComponent(1e-12)).toBe(0);
    expect(snapComponent(-0.9999999999)).toBe(-1);
    expect(snapComponent(1 - 1e-10)).toBe(1);
    expect(snapComponent(0.5)).toBe(0.5);
    expect(snapComponent(1e-8)).toBe(1e-8);
  });
});
