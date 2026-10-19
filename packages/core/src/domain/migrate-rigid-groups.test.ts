import { PANTIN_SCHEMA_VERSION, type PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { importDocument, MACHINE, MACHINE_LOCATIONS } from "../test-support/import-pipeline.ts";
import { type LegacyLink, legacyPoses } from "../test-support/legacy-poses.ts";
import { ABOUT_DIAGONAL, ABOUT_X, ABOUT_Z } from "../test-support/placed-fixtures.ts";
import { computePoses } from "./kinematics.ts";
import { bodiesNowFollowingTheirGroup, migrateV12ToV13 } from "./migrate-rigid-groups.ts";
import { migratePantinDocument } from "./migrations.ts";
import { parsePantinDocument } from "./pantin-document.ts";
import { tagEntries } from "./tag-entries.ts";

// Version 12 to 13 (ADR 0055 point 9): joint ends become bodies or groups.

const SOURCE = { fileName: "a.stl", format: "stl", unit: "m", upAxis: "z", nodes: [] };
const PHASE_6 = { belts: [], guides: [], emitters: [], absorbers: [], presenceSensors: [] };

function body(id: string, assembly: string, placement?: unknown) {
  return { id, name: id, assembly, source: SOURCE, mesh: `meshes/${id}.stl`, placement };
}

function joint(id: string, type: string, parent: string, child: string) {
  const limits = type === "fixed" || type === "continuous" ? {} : { limits: [-2, 2] };
  return {
    id,
    tagKey: id,
    name: id,
    type,
    parent,
    child,
    origin: [0.1, 0.2, 0.3],
    axis: [0, 1, 1],
    ...limits,
  };
}

type RawJoint = ReturnType<typeof joint>;

function rawDocument(assemblies: unknown[], bodies: ReturnType<typeof body>[], joints: RawJoint[]) {
  return {
    schema_version: 12,
    name: "Machine",
    assemblies,
    bodies,
    joints,
    drives: [],
    actuators: [],
    sensors: [],
    ...PHASE_6,
  };
}

const assembly = (key: string, placement: unknown) => ({ key, name: key, placement });

// P holds a hinge; X hangs from P through a slider, with a star of fixed joints
// round its handle "xh" and one moving joint inside; Y hangs from a body of X.
// "p-free" and "x-free" have no parent joint: "x-free" never moved.
function machine() {
  return rawDocument(
    [
      assembly("p", ABOUT_Z),
      assembly("x", ABOUT_X),
      assembly("y", ABOUT_DIAGONAL),
      assembly("z", ABOUT_Z),
    ],
    [
      body("p0", "p"),
      body("p1", "p", ABOUT_X),
      body("p-free", "p"),
      body("xh", "x", ABOUT_Z),
      body("x1", "x"),
      body("x2", "x", ABOUT_DIAGONAL),
      body("x3", "x"),
      body("x-free", "x"),
      body("x4", "x"),
      body("yh", "y"),
      body("y1", "y", ABOUT_X),
      body("zh", "z"),
      body("z1", "z", ABOUT_X),
    ],
    [
      joint("hinge", "revolute", "p0", "p1"),
      joint("slide", "prismatic", "p1", "xh"),
      joint("star-1", "fixed", "xh", "x1"),
      joint("star-2", "fixed", "xh", "x2"),
      joint("star-3", "fixed", "x1", "x3"),
      joint("turn", "revolute", "x2", "yh"),
      joint("star-y", "fixed", "yh", "y1"),
      // Dependents of the body that never moved: a body of its group, and a whole assembly.
      joint("x-dep", "revolute", "x-free", "x4"),
      joint("to-z", "prismatic", "x-free", "zh"),
      joint("star-z", "fixed", "zh", "z1"),
    ],
  );
}

function read(document: unknown): PantinDocument {
  return parsePantinDocument(JSON.stringify(document), "p");
}

function legacyLinks(raw: ReturnType<typeof machine>, migrated: PantinDocument): LegacyLink[] {
  return raw.joints.flatMap((item, at) => {
    const moved = migrated.joints[at];
    return moved === undefined
      ? []
      : [{ joint: moved, parentBody: item.parent, childBody: item.child }];
  });
}

function expectSamePosesAsBefore(raw: ReturnType<typeof machine>, positions: Map<string, number>) {
  const migrated = read(raw);
  const before = legacyPoses(
    migrated.assemblies,
    migrated.bodies,
    legacyLinks(raw, migrated),
    positions,
  );
  // The bodies the notice lists follow their group now (point 9): only they differ.
  const changed = new Set(bodiesNowFollowingTheirGroup(raw));
  const keep = ({ bodyId }: { bodyId: string }) => !changed.has(bodyId);
  // toEqual compares numbers with Object.is: -0 and 0 differ, so this is bit for bit.
  expect(computePoses(migrated, positions).filter(keep)).toEqual(before.filter(keep));
}

describe("migrateV12ToV13", () => {
  it("makes every end a body, and the child of a joint between assemblies its group", () => {
    const migrated = migrateV12ToV13(machine());
    expect(migrated.schema_version).toBe(PANTIN_SCHEMA_VERSION);
    // The migration returns raw JSON. RawJoint types the ends as strings while they are
    // endpoint objects here; only id, parent and child are read, and toEqual checks them.
    const ends = (migrated.joints as RawJoint[]).map(({ id, parent, child }) => [
      id,
      parent,
      child,
    ]);
    expect(ends).toEqual([
      ["hinge", { kind: "body", id: "p0" }, { kind: "body", id: "p1" }],
      ["slide", { kind: "body", id: "p1" }, { kind: "assembly", key: "x" }],
      ["star-1", { kind: "body", id: "xh" }, { kind: "body", id: "x1" }],
      ["star-2", { kind: "body", id: "xh" }, { kind: "body", id: "x2" }],
      ["star-3", { kind: "body", id: "x1" }, { kind: "body", id: "x3" }],
      ["turn", { kind: "body", id: "x2" }, { kind: "assembly", key: "y" }],
      ["star-y", { kind: "body", id: "yh" }, { kind: "body", id: "y1" }],
      ["x-dep", { kind: "body", id: "x-free" }, { kind: "body", id: "x4" }],
      ["to-z", { kind: "body", id: "x-free" }, { kind: "assembly", key: "z" }],
      ["star-z", { kind: "body", id: "zh" }, { kind: "body", id: "z1" }],
    ]);
  });

  it("leaves what it does not understand to the schema", () => {
    const odd = { ...machine(), joints: [7, { id: "j", parent: 3 }], bodies: "x" };
    expect(migrateV12ToV13(odd)).toEqual({ ...odd, schema_version: 13 });
  });
});

describe("bodiesNowFollowingTheirGroup", () => {
  it("lists the jointless bodies of an anchored assembly and what hangs from them, not the anchor child", () => {
    expect(bodiesNowFollowingTheirGroup(machine())).toEqual(["x-free", "x4", "zh", "z1"]);
  });

  it("lists nothing when no assembly is anchored", () => {
    const flat = rawDocument([assembly("p", ABOUT_Z)], [body("a", "p"), body("b", "p")], []);
    expect(bodiesNowFollowingTheirGroup(flat)).toEqual([]);
  });
});

describe("migratePantinDocument notice", () => {
  it("reports the bodies whose behaviour changes, from any older version", () => {
    const notices: string[][] = [];
    migratePantinDocument(machine(), "p", (notice) => notices.push(notice.bodies));
    expect(notices).toEqual([["x-free", "x4", "zh", "z1"]]);
  });

  it("says nothing for a document without such a body, or already current", () => {
    const notices: string[][] = [];
    const report = (notice: { bodies: string[] }) => notices.push(notice.bodies);
    const flat = rawDocument([assembly("p", ABOUT_Z)], [body("a", "p")], []);
    migratePantinDocument(flat, "p", report);
    migratePantinDocument(migrateV12ToV13(machine()), "p", report);
    expect(notices).toEqual([]);
  });
});

describe("poses before and after the migration", () => {
  const POSITION_SETS = [
    new Map<string, number>(),
    new Map([
      ["hinge", 0.7],
      ["slide", -0.4],
      ["turn", 1.3],
      ["x-dep", 0.9],
      ["to-z", 0.25],
    ]),
  ];

  it.each(POSITION_SETS)("are the same bit for bit on a star of fixed joints (%#)", (positions) => {
    expectSamePosesAsBefore(machine(), positions);
  });

  it.each([0, 0.9])("are the same on the joints of a STEP import, hinges at %s", (angle) => {
    const { document } = importDocument(MACHINE, MACHINE_LOCATIONS);
    // The old document: group children back to the handle body (the first body
    // of the group that no joint moves), and the joints between assemblies
    // turned into hinges so that positions matter.
    const handleOf = (key: string) =>
      document.bodies.find(
        (item) =>
          item.assembly === key &&
          !document.joints.some((link) => link.child.kind === "body" && link.child.id === item.id),
      )?.id ?? "";
    const raw = rawDocument(
      document.assemblies,
      // Parsed bodies have every field the raw fixture type lists; only the optional
      // `placement` is typed apart.
      document.bodies as unknown as ReturnType<typeof body>[],
      document.joints.map((link) => {
        const parent = link.parent.kind === "body" ? link.parent.id : handleOf(link.parent.key);
        const child = link.child.kind === "body" ? link.child.id : handleOf(link.child.key);
        return joint(link.id, link.child.kind === "assembly" ? "revolute" : "fixed", parent, child);
      }),
    );
    const hinges = raw.joints.filter((item) => item.type === "revolute");
    expect(hinges.length).toBeGreaterThan(0);
    expectSamePosesAsBefore(raw, new Map(hinges.map((item) => [item.id, angle])));
  });
});

describe("tags after the migration", () => {
  it("keep the prefix of every movable joint: the assembly of its child", () => {
    const raw = machine();
    const assemblyOf = new Map(raw.bodies.map((item) => [item.id, item.assembly]));
    const before = raw.joints
      .filter((item) => item.type !== "fixed")
      .flatMap((item) => [
        `${assemblyOf.get(item.child)}.${item.tagKey}.setpoint`,
        `${assemblyOf.get(item.child)}.${item.tagKey}.position`,
      ]);
    expect(tagEntries(read(raw)).map((entry) => entry.name)).toEqual(before);
  });
});
