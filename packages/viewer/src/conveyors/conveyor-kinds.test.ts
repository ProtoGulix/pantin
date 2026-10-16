import { describe, expect, it } from "vitest";
import { conveyorPantin } from "./conveyor-fixtures.ts";
import { conveyorOfKey, conveyorsOf, findConveyor, isConveyorKind } from "./conveyor-kinds.ts";
import { selectedConveyorKey } from "./conveyor-selection.ts";

const { document } = conveyorPantin();

describe("the phase 6 kinds", () => {
  it("lists the objects of a kind and finds one by id", () => {
    expect(conveyorsOf(document, "emitter").map((emitter) => emitter.id)).toEqual(["source"]);
    expect(findConveyor(document, "presenceSensor", "cell")?.type).toBe("photoelectric");
    expect(findConveyor(document, "belt", "ghost")).toBeUndefined();
  });

  it("tells a phase 6 kind from the other devices", () => {
    expect(["belt", "guide", "emitter", "absorber", "presenceSensor"].every(isConveyorKind)).toBe(
      true,
    );
    expect(["drive", "actuator", "sensor", "joint"].some(isConveyorKind)).toBe(false);
  });

  it("reads the key of the pose stream back, ids with a colon included", () => {
    expect(conveyorOfKey("belt:feed")).toEqual({ kind: "belt", id: "feed" });
    expect(conveyorOfKey("guide:a:b")).toEqual({ kind: "guide", id: "a:b" });
    expect(conveyorOfKey("drive:v1")).toBeNull();
    expect(conveyorOfKey("nothing")).toBeNull();
  });

  it("gives the key of the selected object, and none for any other selection", () => {
    expect(selectedConveyorKey({ kind: "belt", id: "feed" })).toBe("belt:feed");
    expect(selectedConveyorKey({ kind: "drive", id: "v1" })).toBeNull();
    expect(selectedConveyorKey({ kind: "node", nodeId: "pantin:press" })).toBeNull();
    expect(selectedConveyorKey(null)).toBeNull();
  });
});
