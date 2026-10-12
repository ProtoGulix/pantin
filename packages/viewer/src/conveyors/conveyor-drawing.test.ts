import type { Belt, Emitter, PantinDocument, Placement, PresenceSensor } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { pantinResponse } from "../test-fixtures.ts";
import {
  BELT_THICKNESS,
  beamParts,
  beltParts,
  conveyorDrawingOf,
  standingBox,
} from "./conveyor-drawing.ts";

const PLACEMENT: Placement = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };
const FRAME = { assembly: "main", body: "rail", placement: PLACEMENT };

describe("standingBox", () => {
  it("puts the bottom face at the origin, in Babylon axes", () => {
    expect(standingBox("emitter", [0.4, 0.3, 0.2])).toEqual({
      kind: "box",
      style: "emitter",
      size: [0.4, 0.2, 0.3],
      centre: [0, 0.1, 0],
    });
  });
});

describe("beltParts", () => {
  const [slab, arrow] = beltParts({ length: 1, width: 0.4 });

  it("has its top face at the origin: length along X, width along Babylon Z", () => {
    expect(slab).toEqual({
      kind: "box",
      style: "belt",
      size: [1, BELT_THICKNESS, 0.4],
      centre: [0, -BELT_THICKNESS / 2, 0],
    });
  });

  it("draws the travel arrow along +X, on the surface", () => {
    if (arrow?.kind !== "arrow") {
      throw new Error("expected an arrow");
    }
    expect(arrow.tail[0]).toBeLessThan(arrow.tip[0]);
    expect(arrow.tail[1]).toBeGreaterThan(0);
    expect(arrow.tail[1]).toBe(arrow.tip[1]);
    expect(arrow.tail[2]).toBe(0);
    expect(arrow.tip[0] - arrow.tail[0]).toBeLessThanOrEqual(1);
    expect(arrow.headLength).toBeLessThan(arrow.tip[0] - arrow.tail[0]);
  });
});

describe("beamParts", () => {
  it("runs from the origin along core +Z (Babylon Y) for the range", () => {
    expect(beamParts("diffuse", 0.5)).toEqual([
      { kind: "beam", length: 0.5, diameter: expect.any(Number), centre: [0, 0.25, 0] },
    ]);
  });

  it("adds a receiver at the end of a through-beam barrier", () => {
    const parts = beamParts("through_beam", 0.5);
    expect(parts).toHaveLength(2);
    const receiver = parts[1];
    if (receiver?.kind !== "box") {
      throw new Error("expected a box");
    }
    expect(receiver.style).toBe("receiver");
    expect(receiver.centre[1]).toBeGreaterThan(0.5);
  });
});

const base: PantinDocument = pantinResponse(false).document;
const belt: Belt = {
  id: "belt",
  name: "Belt",
  ...FRAME,
  length: 1,
  width: 0.4,
  drumJoint: "drum",
  drumRadius: 0.05,
};
const emitter: Emitter = {
  id: "emitter",
  tagKey: "emit",
  name: "Emitter",
  ...FRAME,
  box: { size: [0.2, 0.2, 0.2], mass: 1, material: "cardboard" },
};
const cell: PresenceSensor = {
  id: "cell",
  tagKey: "cell",
  name: "Cell",
  ...FRAME,
  type: "photoelectric",
  mode: "diffuse",
  range: 0.3,
  normallyClosed: false,
  onDelay: 0,
  offDelay: 0,
};

describe("conveyorDrawingOf", () => {
  it("is empty without a document or objects", () => {
    expect(conveyorDrawingOf(undefined)).toEqual([]);
    expect(conveyorDrawingOf(base)).toEqual([]);
  });

  it("lists every kind of object, keyed kind:id like the pose stream", () => {
    const items = conveyorDrawingOf({
      ...base,
      belts: [belt],
      emitters: [emitter],
      guides: [{ id: "guide", name: "Guide", ...FRAME, size: [1, 0.02, 0.1] }],
      absorbers: [{ id: "sink", name: "Sink", ...FRAME, size: [0.2, 0.4, 0.2] }],
      presenceSensors: [cell],
    });
    expect(items.map((item) => item.key)).toEqual([
      "belt:belt",
      "guide:guide",
      "emitter:emitter",
      "absorber:sink",
      "presenceSensor:cell",
    ]);
  });

  it("names the state tag of a presence sensor, none for the others", () => {
    const items = conveyorDrawingOf({ ...base, belts: [belt], presenceSensors: [cell] });
    expect(items.map((item) => item.stateTag)).toEqual([null, "main.cell.state"]);
  });
});
