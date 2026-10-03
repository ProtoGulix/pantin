import type { Actuator, Drive, PantinDocument, Sensor } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { ApiError } from "../errors.ts";
import { NO_POSITIONS } from "../test-support/no-positions.ts";
import {
  ABOUT_DIAGONAL,
  ABOUT_X,
  assembly,
  body,
  documentOf,
  expectSamePoses,
  joint,
} from "../test-support/placed-fixtures.ts";
import { deriveAssemblyAnchors } from "./assembly-anchors.ts";
import { deleteAssemblyWithContents } from "./assembly-deletion.ts";
import { createAssembly, deleteAssembly } from "./assembly-edits.ts";

// ADR 0037: deleting an assembly with its contents. The default fixture has
// "main" (frame, carriage), "chape" (clevis, rod), "tail" (pin) and "other".

const SLIDE = joint({
  id: "slide",
  type: "prismatic",
  parent: "frame",
  child: "carriage",
  axis: [1, 0, 0],
  limits: [0, 1],
});
// Between assemblies: the chape hangs from the carriage, 0.3 m along its axis.
const MOUNT_SLIDE = joint({
  id: "mount",
  type: "prismatic",
  parent: "carriage",
  child: "clevis",
  axis: [1, 0, 0],
  limits: [0, 1],
});
const MOUNT_FIXED = joint({ id: "mount", type: "fixed", parent: "carriage", child: "clevis" });
const HINGE = joint({ id: "hinge", parent: "clevis", child: "pin", origin: [0.2, 0, 0.1] });
const ROD_MOUNT = joint({ id: "rod-mount", type: "fixed", parent: "clevis", child: "rod" });
const ROD_SLIDE = joint({
  id: "rod-slide",
  type: "prismatic",
  parent: "clevis",
  child: "rod",
  axis: [1, 0, 0],
  limits: [0, 1],
});
const POSITIONS = new Map([
  ["slide", 0.2],
  ["mount", 0.3],
  ["hinge", 0.6],
  ["rod-slide", 0.1],
]);

function drive(id: string, assemblyKey: string): Drive {
  return { id, tagKey: id, name: `Drive ${id}`, assembly: assemblyKey, type: "valve_5_3_closed" };
}

function cylinder(
  id: string,
  assemblyKey: string,
  extra: Partial<Pick<Actuator, "feed" | "joints">> = {},
): Actuator {
  return {
    id,
    name: `Actuator ${id}`,
    assembly: assemblyKey,
    type: "double_acting_cylinder",
    extendSpeed: 0.2,
    retractSpeed: 0.2,
    joints: [],
    ...extra,
  };
}

function limitSwitch(id: string, assemblyKey: string, jointId: string): Sensor {
  return {
    id,
    tagKey: id,
    name: `Sensor ${id}`,
    assembly: assemblyKey,
    joint: jointId,
    type: "position_switch",
    range: [0.098, 0.1],
    normallyClosed: false,
  };
}

function expectConflict(action: () => unknown, ...fragments: string[]): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("conflict");
    for (const fragment of fragments) {
      expect((error as ApiError).message).toContain(fragment);
    }
    return;
  }
  throw new Error("Expected the deletion to be refused.");
}

describe("removal of the assembly and its joints", () => {
  it("removes the 3 bodies and 2 fixed joints of a STEP import, and leaves the others as they were", () => {
    const before = documentOf(
      [
        joint({ id: "weld-1", type: "fixed", parent: "a", child: "b" }),
        joint({ id: "weld-2", type: "fixed", parent: "a", child: "c" }),
      ],
      [body("a", "step"), body("b", "step"), body("c", "step"), body("o", "other", ABOUT_X)],
      [assembly("step", ABOUT_X), assembly("other", ABOUT_DIAGONAL)],
    );
    const { document, deletion, meshPaths } = deleteAssemblyWithContents(
      before,
      "step",
      NO_POSITIONS,
    );
    expect(document.assemblies).toEqual([assembly("other", ABOUT_DIAGONAL)]);
    expect(document.bodies).toEqual([body("o", "other", ABOUT_X)]);
    expect(document.joints).toEqual([]);
    expect(deletion.bodies.map(({ id }) => id)).toEqual(["a", "b", "c"]);
    expect(deletion.joints).toEqual([
      { id: "weld-1", name: "weld-1", betweenAssemblies: false },
      { id: "weld-2", name: "weld-2", betweenAssemblies: false },
    ]);
    expect(deletion.reanchoredAssemblies).toEqual([]);
    expect(meshPaths).toEqual(["meshes/a.stl", "meshes/b.stl", "meshes/c.stl"]);
  });

  it("gives the same document as deleteAssembly for an empty assembly", () => {
    const { document: before, assembly: spare } = createAssembly(documentOf([SLIDE]), "Spare");
    const result = deleteAssemblyWithContents(before, spare.key, NO_POSITIONS);
    expect(result.document).toEqual(deleteAssembly(before, spare.key));
    expect(result.meshPaths).toEqual([]);
    expect(result.deletion.bodies).toEqual([]);
  });
});

describe("unknown assembly and shared mesh files", () => {
  it("refuses an unknown key with not_found", () => {
    const run = () => deleteAssemblyWithContents(documentOf([SLIDE]), "ghost", NO_POSITIONS);
    expect(run).toThrow(ApiError);
    expect(run).toThrow('no assembly "ghost"');
    try {
      run();
    } catch (error) {
      expect((error as ApiError).code).toBe("not_found");
    }
  });

  it("does not release a mesh file that a remaining body still uses", () => {
    const shared = { ...body("shared", "other"), mesh: "meshes/frame.stl" };
    const before = documentOf(
      [],
      [body("frame", "main"), body("lonely", "main"), shared],
      [assembly("main", ABOUT_X), assembly("other", ABOUT_DIAGONAL)],
    );
    const { meshPaths } = deleteAssemblyWithContents(before, "main", NO_POSITIONS);
    expect(meshPaths).toEqual(["meshes/lonely.stl"]);
  });
});

describe("effects on other assemblies (ADR 0037 point 2)", () => {
  it("anchors the child assembly to the world and keeps its displayed pose", () => {
    const before = documentOf([SLIDE, MOUNT_SLIDE, ROD_MOUNT]);
    const { document, deletion } = deleteAssemblyWithContents(before, "main", POSITIONS);
    expect(deriveAssemblyAnchors(document).has("chape")).toBe(false);
    expectSamePoses(document, before, POSITIONS, ["clevis", "rod"]);
    expect(document.assemblies.find(({ key }) => key === "chape")?.placement).not.toEqual(ABOUT_X);
    expect(deletion.reanchoredAssemblies).toEqual([{ key: "chape", name: "chape" }]);
    expect(deletion.removedTags).toEqual(
      expect.arrayContaining(["chape.mount.setpoint", "chape.mount.position"]),
    );
    expect(deletion.joints.find(({ id }) => id === "mount")?.betweenAssemblies).toBe(true);
    expect(deletion.joints.find(({ id }) => id === "slide")?.betweenAssemblies).toBe(false);
  });

  it("leaves the placement of the assembly it was anchored to untouched, bit for bit", () => {
    const before = documentOf([SLIDE, MOUNT_FIXED, ROD_MOUNT]);
    const { document, deletion } = deleteAssemblyWithContents(before, "chape", POSITIONS);
    expect(document.assemblies.find(({ key }) => key === "main")).toStrictEqual(
      before.assemblies.find(({ key }) => key === "main"),
    );
    expect(deletion.reanchoredAssemblies).toEqual([]);
    expect(document.joints.map(({ id }) => id)).toEqual(["slide"]);
  });

  it("keeps the world pose of a whole chain Z -> Y -> X below the deleted assembly", () => {
    const before = documentOf([SLIDE, MOUNT_SLIDE, HINGE, ROD_MOUNT]);
    const { document, deletion } = deleteAssemblyWithContents(before, "main", POSITIONS);
    expectSamePoses(document, before, POSITIONS, ["clevis", "rod", "pin"]);
    // Only Y is re-anchored: Z hangs from Y and keeps its relative placement.
    expect(deletion.reanchoredAssemblies.map(({ key }) => key)).toEqual(["chape"]);
    expect(document.assemblies.find(({ key }) => key === "tail")).toStrictEqual(
      before.assemblies.find(({ key }) => key === "tail"),
    );
    expect([...deriveAssemblyAnchors(document).keys()]).toEqual(["tail"]);
  });
});

describe("what the assembly owns", () => {
  it("removes its drives, actuators and sensors, and frees the setpoint of a joint it moved", () => {
    const before: PantinDocument = {
      ...documentOf([SLIDE, ROD_SLIDE]),
      drives: [drive("valve", "main")],
      actuators: [
        cylinder("press", "main", {
          feed: { drive: "valve", ports: { cap: "port_4", rod: "port_2" } },
          // A joint of "chape", moved by an actuator of "main".
          joints: ["rod-slide"],
        }),
      ],
      sensors: [limitSwitch("end", "main", "slide")],
    };
    const { document, deletion } = deleteAssemblyWithContents(before, "main", POSITIONS);
    expect(document.drives).toEqual([]);
    expect(document.actuators).toEqual([]);
    expect(document.sensors).toEqual([]);
    expect(document.joints.map(({ id }) => id)).toEqual(["rod-slide"]);
    expect(deletion.drives).toEqual([{ id: "valve", name: "Drive valve" }]);
    expect(deletion.actuators).toEqual([{ id: "press", name: "Actuator press" }]);
    expect(deletion.sensors).toEqual([{ id: "end", name: "Sensor end" }]);
    expect(deletion.addedTags).toEqual(["chape.rod-slide.setpoint"]);
    expect(deletion.removedTags).toEqual(
      expect.arrayContaining(["main.slide.position", "main.valve.coil_14", "main.end.state"]),
    );
  });
});

describe("refusals for items of other assemblies (ADR 0037 point 3)", () => {
  const cases: [string, Partial<PantinDocument>, string[]][] = [
    [
      "an actuator of another assembly moves a removed joint",
      { actuators: [cylinder("grip", "chape", { joints: ["slide"] })] },
      [
        'Actuator "Actuator grip" of assembly "chape" moves joint "slide", which would be deleted.',
        "Remove the joint from the actuator, or delete the actuator, first.",
      ],
    ],
    [
      "a sensor of another assembly watches a removed joint",
      { sensors: [limitSwitch("end", "chape", "slide")] },
      [
        'Sensor "Sensor end" of assembly "chape" watches joint "slide", which would be deleted.',
        "Point the sensor at another joint, or delete it, first.",
      ],
    ],
    [
      "an actuator of another assembly is fed by a removed drive",
      {
        drives: [drive("valve", "main")],
        actuators: [
          cylinder("grip", "chape", {
            feed: { drive: "valve", ports: { cap: "port_4", rod: "port_2" } },
          }),
        ],
      },
      [
        'Actuator "Actuator grip" of assembly "chape" is fed by drive "Drive valve", which would be deleted.',
        "Remove the feed from the actuator, or delete the actuator, first.",
      ],
    ],
  ];

  it.each(cases)("refuses when %s, and changes nothing", (_title, extra, fragments) => {
    const before: PantinDocument = { ...documentOf([SLIDE, ROD_MOUNT]), ...extra };
    const snapshot = structuredClone(before);
    expectConflict(
      () => deleteAssemblyWithContents(before, "main", POSITIONS),
      'Assembly "main" cannot be deleted with its contents.',
      ...fragments,
    );
    expect(before).toEqual(snapshot);
  });
});
