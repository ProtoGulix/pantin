import { describe, expect, it } from "vitest";
import { ApiError } from "../errors.ts";
import {
  belt,
  conveyorDocument,
  drumJoint,
  emitter,
  guide,
} from "../test-support/conveyor-fixtures.ts";
import { expectConflict } from "../test-support/expect-conflict.ts";
import {
  ABSORBERS,
  addConveyorItem,
  BELTS,
  deleteConveyorItem,
  EMITTERS,
  GUIDES,
  PRESENCE_SENSORS,
  replaceConveyorItem,
} from "./conveyor-edits.ts";

// Pure edits of the phase 6 arrays (ADR 0043 point 12).

const { id: _beltId, ...beltRequest } = belt();
const { id: _emitterId, tagKey: _emitterKey, ...emitterRequest } = emitter();
const { id: _guideId, ...guideRequest } = guide();

describe("addConveyorItem", () => {
  it("derives the id from the name, unique among its kind", () => {
    const first = addConveyorItem(BELTS, conveyorDocument(), beltRequest);
    const second = addConveyorItem(BELTS, first.document, beltRequest);
    expect([first.item.id, second.item.id]).toEqual(["feed-belt", "feed-belt-2"]);
    expect(second.document.belts).toHaveLength(2);
  });

  it("falls back to the kind's name when the name leaves no usable character", () => {
    const { item } = addConveyorItem(GUIDES, conveyorDocument(), { ...guideRequest, name: "!!!" });
    expect(item.id).toBe("guide");
  });

  it("gives an emitter a tag key that avoids the other owners of its assembly", () => {
    // The drum joint's child is in assembly "main": it owns the key "drum".
    const { item } = addConveyorItem(EMITTERS, conveyorDocument(), {
      ...emitterRequest,
      name: "Drum",
    });
    expect([item.id, item.tagKey]).toEqual(["drum", "drum-2"]);
  });

  it("does not change the document it was given", () => {
    const before = conveyorDocument();
    addConveyorItem(BELTS, before, beltRequest);
    expect(before.belts).toEqual([]);
  });

  it("applies the document rules, as a validation error naming the field", () => {
    const refusal = () =>
      addConveyorItem(BELTS, conveyorDocument(), { ...beltRequest, drumJoint: "ghost" });
    expect(refusal).toThrow(/not a continuous joint/);
    expect(refusal).toThrow(ApiError);
  });
});

describe("replaceConveyorItem", () => {
  it("replaces every field but the id and the tag key", () => {
    const { document } = addConveyorItem(EMITTERS, conveyorDocument(), emitterRequest);
    const { item } = replaceConveyorItem(EMITTERS, document, "source", {
      ...emitterRequest,
      name: "Other",
      box: { size: [1, 1, 1], mass: 4, material: "steel" },
    });
    expect(item).toMatchObject({ id: "source", tagKey: "source", name: "Other" });
    expect(item.box.material).toBe("steel");
  });

  it("changes the type of a presence sensor, which keeps its id", () => {
    const request = {
      name: "Cell",
      assembly: "main",
      placement: belt().placement,
      type: "photoelectric" as const,
      mode: "diffuse" as const,
      range: 0.5,
      normallyClosed: false,
      onDelay: 0,
      offDelay: 0,
    };
    const { document } = addConveyorItem(PRESENCE_SENSORS, conveyorDocument(), request);
    const { item } = replaceConveyorItem(PRESENCE_SENSORS, document, "cell", {
      ...request,
      mode: "through_beam",
    });
    expect(item).toMatchObject({ id: "cell", mode: "through_beam" });
  });
});

describe("replaceConveyorItem refusals", () => {
  it("is not found for an unknown id, naming the kind", () => {
    const refusal = () => replaceConveyorItem(ABSORBERS, conveyorDocument(), "ghost", guideRequest);
    expect(refusal).toThrow('This Pantin has no absorber "ghost".');
  });

  it("refuses a move to an assembly where the tag key is taken, as a conflict", () => {
    const base = conveyorDocument();
    const { document } = addConveyorItem(EMITTERS, base, { ...emitterRequest, assembly: "line" });
    // Another emitter owns "source" in "main".
    const { document: both } = addConveyorItem(EMITTERS, document, emitterRequest);
    expectConflict(
      () => replaceConveyorItem(EMITTERS, both, "source", { ...emitterRequest, assembly: "main" }),
      'Tag key "source" of emitter "source" is already used by emitter "source-2"',
    );
  });

  it("refuses a drum that stops being continuous", () => {
    const { document } = addConveyorItem(BELTS, conveyorDocument(), beltRequest);
    const revolute = {
      ...drumJoint(),
      type: "revolute" as const,
      limits: [0, 1] as [number, number],
    };
    expect(() =>
      replaceConveyorItem(BELTS, { ...document, joints: [revolute] }, "feed-belt", beltRequest),
    ).toThrow(/not a continuous joint/);
  });
});

describe("deleteConveyorItem", () => {
  it("removes only the item", () => {
    const { document } = addConveyorItem(BELTS, conveyorDocument(), beltRequest);
    const { document: two } = addConveyorItem(BELTS, document, beltRequest);
    expect(deleteConveyorItem(BELTS, two, "feed-belt").belts.map(({ id }) => id)).toEqual([
      "feed-belt-2",
    ]);
  });

  it("is not found for an unknown id", () => {
    expect(() => deleteConveyorItem(GUIDES, conveyorDocument(), "ghost")).toThrow(
      'This Pantin has no guide "ghost".',
    );
  });
});
