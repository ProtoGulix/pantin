import { MATERIAL_FACTORS } from "@pantin/sensor-types/schemas";
import { describe, expect, it } from "vitest";
import { PANTIN_SCHEMA_VERSION, PantinDocumentSchema } from "./pantin.ts";
import { PRODUCT_MATERIALS } from "./pantin-conveyors.ts";

// Document rules of belts, guides, emitters, absorbers and presence sensors
// (ADR 0043 points 1 and 2).

const placement = { translation: [0, 0, 0.5], rotation: [0, 0, 0, 1] };

function body(id: string, assembly: string) {
  return {
    id,
    name: id,
    assembly,
    source: { fileName: "m.glb", format: "glb", unit: "m", upAxis: "z", nodes: [] },
    mesh: `meshes/${id}.glb`,
  };
}

function joint(id: string, child: string, type: string) {
  const limits = type === "prismatic" ? { limits: [0, 0.1] } : {};
  return {
    id,
    tagKey: id,
    name: id,
    type,
    parent: "frame",
    child,
    origin: [0, 0, 0],
    axis: [0, 1, 0],
    ...limits,
  };
}

const belt = {
  id: "feed",
  name: "Feed",
  assembly: "line",
  body: "frame",
  placement,
  length: 1,
  width: 0.4,
  drumJoint: "drum",
  drumRadius: 0.05,
};
const guide = { id: "rail", name: "Rail", assembly: "line", placement, size: [1, 0.02, 0.1] };
const emitter = {
  id: "source",
  tagKey: "source",
  name: "Source",
  assembly: "line",
  placement,
  box: { size: [0.3, 0.2, 0.2], mass: 1.5, material: "cardboard" },
};
const absorber = { id: "sink", name: "Sink", assembly: "line", placement, size: [0.2, 0.4, 0.2] };
const cell = {
  id: "cell",
  tagKey: "cell",
  name: "Cell",
  assembly: "line",
  placement,
  type: "photoelectric",
  mode: "diffuse",
  range: 0.6,
  normallyClosed: false,
  onDelay: 0,
  offDelay: 0.05,
};

const conveyor = {
  schema_version: PANTIN_SCHEMA_VERSION,
  name: "Line",
  assemblies: [
    { key: "line", name: "Line", placement },
    { key: "other", name: "Other", placement },
  ],
  bodies: [body("frame", "line"), body("roller", "line"), body("foreign", "other")],
  joints: [joint("drum", "roller", "continuous"), joint("slide", "foreign", "prismatic")],
  drives: [],
  actuators: [],
  sensors: [],
  belts: [belt],
  guides: [guide],
  emitters: [emitter],
  absorbers: [absorber],
  presenceSensors: [cell],
};

function issuesOf(document: unknown): string[] {
  const parsed = PantinDocumentSchema.safeParse(document);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}

describe("PantinDocumentSchema phase 6 objects", () => {
  it("is version 12 and accepts one object of each kind", () => {
    expect(PANTIN_SCHEMA_VERSION).toBe(12);
    expect(issuesOf(conveyor)).toEqual([]);
  });
});

describe("PantinDocumentSchema phase 6 values", () => {
  it("accepts a through-beam cell and every material", () => {
    const presenceSensors = [{ ...cell, mode: "through_beam" }];
    expect(issuesOf({ ...conveyor, presenceSensors })).toEqual([]);
    for (const material of PRODUCT_MATERIALS) {
      const box = { ...emitter.box, material };
      expect(issuesOf({ ...conveyor, emitters: [{ ...emitter, box }] })).toEqual([]);
    }
  });

  it("lists the metals of the inductive switch, and no other", () => {
    const metals = PRODUCT_MATERIALS.filter((m) => !["cardboard", "plastic", "wood"].includes(m));
    expect([...metals].sort()).toEqual(Object.keys(MATERIAL_FACTORS).sort());
  });

  it("refuses a box mass or size of infinity or NaN", () => {
    const box = { ...emitter.box, mass: Number.POSITIVE_INFINITY, size: [1, Number.NaN, 1] };
    expect(issuesOf({ ...conveyor, emitters: [{ ...emitter, box }] })).not.toEqual([]);
  });

  it.each(["belts", "guides", "emitters", "absorbers", "presenceSensors"])(
    "refuses a document without its %s list",
    (list) => {
      const { [list]: _removed, ...without } = conveyor as Record<string, unknown>;
      expect(issuesOf(without)).not.toEqual([]);
    },
  );
});

describe("PantinDocumentSchema phase 6 refused values", () => {
  it.each([
    [
      "a zero belt length",
      { ...conveyor, belts: [{ ...belt, length: 0 }] },
      /belt length must be greater/,
    ],
    [
      "a negative width",
      { ...conveyor, belts: [{ ...belt, width: -1 }] },
      /belt width must be greater/,
    ],
    [
      "a missing drum radius",
      { ...conveyor, belts: [{ ...belt, drumRadius: null }] },
      /Invalid input|number/,
    ],
    [
      "a zero guide size",
      { ...conveyor, guides: [{ ...guide, size: [1, 0, 1] }] },
      /size along Y must be greater/,
    ],
    [
      "a zero box mass",
      { ...conveyor, emitters: [{ ...emitter, box: { ...emitter.box, mass: 0 } }] },
      /box mass must be greater/,
    ],
    [
      "an unknown material",
      { ...conveyor, emitters: [{ ...emitter, box: { ...emitter.box, material: "gold" } }] },
      /Invalid option|expected one of/i,
    ],
    [
      "a zero range",
      { ...conveyor, presenceSensors: [{ ...cell, range: 0 }] },
      /range must be greater/,
    ],
    [
      "a negative delay",
      { ...conveyor, presenceSensors: [{ ...cell, onDelay: -0.1 }] },
      /on delay must not be negative/,
    ],
    [
      "an unknown mode",
      { ...conveyor, presenceSensors: [{ ...cell, mode: "radar" }] },
      /Invalid option|expected one of/i,
    ],
  ])("refuses %s", (_case, document, message) => {
    expect(issuesOf(document).join(" ")).toMatch(message);
  });
});

describe("PantinDocumentSchema phase 6 frames", () => {
  it("refuses an unknown assembly for each kind", () => {
    const ghost = { assembly: "ghost" };
    const document = {
      ...conveyor,
      belts: [{ ...belt, ...ghost, body: undefined }],
      guides: [{ ...guide, ...ghost }],
      emitters: [{ ...emitter, ...ghost }],
      absorbers: [{ ...absorber, ...ghost }],
      presenceSensors: [{ ...cell, ...ghost }],
    };
    expect(issuesOf(document)).toEqual([
      'Belt "feed" is in assembly "ghost", which does not exist.',
      'Guide "rail" is in assembly "ghost", which does not exist.',
      'Emitter "source" is in assembly "ghost", which does not exist.',
      'Absorber "sink" is in assembly "ghost", which does not exist.',
      'Presence sensor "cell" is in assembly "ghost", which does not exist.',
    ]);
  });

  it("refuses a body that does not exist or belongs to another assembly", () => {
    expect(issuesOf({ ...conveyor, guides: [{ ...guide, body: "ghost" }] })).toEqual([
      'Guide "rail" follows body "ghost", which does not exist.',
    ]);
    expect(issuesOf({ ...conveyor, absorbers: [{ ...absorber, body: "foreign" }] })).toEqual([
      'Absorber "sink" follows body "foreign", which is in assembly "other", not "line". Pick a body of its assembly.',
    ]);
  });

  it("refuses a drum that is missing or not continuous", () => {
    const message = (drumJoint: string) =>
      `Belt "feed" turns on "${drumJoint}", which is not a continuous joint of this Pantin.`;
    expect(issuesOf({ ...conveyor, belts: [{ ...belt, drumJoint: "slide" }] })).toEqual([
      message("slide"),
    ]);
    expect(issuesOf({ ...conveyor, belts: [{ ...belt, drumJoint: "ghost" }] })).toEqual([
      message("ghost"),
    ]);
  });

  it("lets several belts share one drum", () => {
    expect(issuesOf({ ...conveyor, belts: [belt, { ...belt, id: "feed-2" }] })).toEqual([]);
  });
});

describe("PantinDocumentSchema phase 6 ids and tag keys", () => {
  it("refuses ids used twice in an array", () => {
    expect(issuesOf({ ...conveyor, belts: [belt, belt] })).toEqual([
      'Belt id "feed" is used twice; belt ids must be unique.',
    ]);
    expect(
      issuesOf({ ...conveyor, presenceSensors: [cell, { ...cell, tagKey: "other" }] }),
    ).toEqual(['Presence sensor id "cell" is used twice; presence sensor ids must be unique.']);
  });

  it("allows the same id in different arrays", () => {
    const document = { ...conveyor, guides: [{ ...guide, id: "feed" }] };
    expect(issuesOf(document)).toEqual([]);
  });

  it("refuses a tag key shared by an emitter and a presence sensor, or with a joint, in one assembly", () => {
    expect(issuesOf({ ...conveyor, presenceSensors: [{ ...cell, tagKey: "source" }] })).toEqual([
      'Tag key "source" of presence sensor "cell" is already used in assembly "line".',
    ]);
    expect(issuesOf({ ...conveyor, emitters: [{ ...emitter, tagKey: "drum" }] })).toEqual([
      'Tag key "drum" of emitter "source" is already used in assembly "line".',
    ]);
  });

  it("lets two assemblies use the same tag key", () => {
    const presenceSensors = [{ ...cell, assembly: "other" }];
    expect(
      issuesOf({ ...conveyor, emitters: [{ ...emitter, tagKey: "cell" }], presenceSensors }),
    ).toEqual([]);
  });
});
