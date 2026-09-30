import { describe, expect, it } from "vitest";
import { PANTIN_SCHEMA_VERSION, PantinDocumentSchema } from "./pantin.ts";

// Document rules of drives (ADR 0028 point 9): a drive has an id, a known
// assembly and its type's fields; it lists no joint.

const valve = {
  id: "valve",
  tagKey: "valve",
  name: "Valve",
  assembly: "press",
  type: "valve_5_3_closed",
};

const press = {
  schema_version: PANTIN_SCHEMA_VERSION,
  name: "Press",
  assemblies: [{ key: "press", name: "Press" }],
  bodies: [],
  joints: [],
  drives: [valve],
  actuators: [],
  sensors: [],
};

function issuesOf(document: unknown): string[] {
  const parsed = PantinDocumentSchema.safeParse(document);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}

describe("PantinDocumentSchema drives", () => {
  it("accepts a drive of each family", () => {
    const drives = [
      valve,
      { ...valve, id: "starter", tagKey: "starter", type: "contactor" },
      { ...valve, id: "vfd", tagKey: "vfd", type: "vfd_on_off", acceleration: 50 },
      {
        ...valve,
        id: "servo",
        tagKey: "servo",
        type: "servo_drive",
        maxSpeed: 1,
        maxAcceleration: 2,
      },
    ];
    expect(issuesOf({ ...press, drives })).toEqual([]);
  });

  it.each([
    ["an unknown assembly", { assembly: "ghost" }, /assembly "ghost", which does not exist/],
    ["an unknown type", { type: "double_acting_cylinder" }, /./],
    ["a zero ramp", { type: "vfd_on_off", acceleration: 0 }, /greater than zero/],
  ])("refuses a drive with %s", (_case, change, message) => {
    expect(issuesOf({ ...press, drives: [{ ...valve, ...change }] }).join(" ")).toMatch(message);
  });

  it("refuses two drives with the same id or the same tag key in one assembly", () => {
    const twin = { ...valve, type: "contactor" };
    expect(issuesOf({ ...press, drives: [valve, twin] })).toEqual(
      expect.arrayContaining([
        'Drive id "valve" is used twice; drive ids must be unique.',
        'Tag key "valve" of drive "valve" is already used in assembly "press".',
      ]),
    );
  });
});
