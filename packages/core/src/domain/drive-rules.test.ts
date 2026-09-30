import {
  type CreateDriveRequest,
  PANTIN_SCHEMA_VERSION,
  type PantinDocument,
} from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  addDriveToDocument,
  deleteDriveFromDocument,
  renameDriveTagKey,
  updateDriveInDocument,
} from "./drive-rules.ts";

// Drive edits in a document (ADR 0022 points 4 and 8, ADR 0028 point 10).

function body(id: string, assembly: string) {
  return {
    id,
    name: id,
    assembly,
    source: {
      fileName: "press.stl",
      format: "stl" as const,
      unit: "mm" as const,
      upAxis: "z" as const,
      nodes: [],
    },
    mesh: `meshes/${id}.stl`,
  };
}

const PRESS: PantinDocument = {
  schema_version: PANTIN_SCHEMA_VERSION,
  name: "Press",
  assemblies: [
    { key: "pince", name: "Pince" },
    { key: "levage", name: "Levage" },
  ],
  bodies: [body("frame", "pince"), body("rod", "pince"), body("lift", "levage")],
  joints: [
    {
      id: "tige",
      tagKey: "tige",
      name: "Tige",
      type: "prismatic",
      parent: "frame",
      child: "rod",
      origin: [0, 0, 0],
      axis: [1, 0, 0],
      limits: [0, 0.1],
    },
  ],
  drives: [],
  actuators: [],
  sensors: [],
};

function valve(name = "Tige", assembly = "pince"): CreateDriveRequest {
  return { name, assembly, type: "valve_5_3_closed" };
}

describe("drive rules", () => {
  it("derives the id and the tag key from the name, the key avoiding the joints' keys", () => {
    const { drive } = addDriveToDocument(PRESS, valve());
    expect([drive.id, drive.tagKey]).toEqual(["tige", "tige-2"]);
  });

  it("keeps the id and the tag key when the drive changes, the type included", () => {
    const { document, drive } = addDriveToDocument(PRESS, valve("Valve"));
    const servo: CreateDriveRequest = {
      name: "Motor",
      assembly: "pince",
      type: "servo_drive",
      maxSpeed: 1,
      maxAcceleration: 2,
    };
    expect(updateDriveInDocument(document, drive.id, servo).drive).toMatchObject({
      id: "valve",
      tagKey: "valve",
      type: "servo_drive",
    });
  });

  it("refuses a move to an assembly where its tag key is taken", () => {
    const { document } = addDriveToDocument(PRESS, valve("Tige", "levage"));
    expect(() => updateDriveInDocument(document, "tige", valve("Tige", "pince"))).toThrow(
      /Tag key "tige" of drive "tige" is already used by joint "tige" in assembly "pince"/,
    );
  });

  it("refuses a tag key taken in its assembly, naming a free one", () => {
    const { document } = addDriveToDocument(PRESS, valve("Valve"));
    expect(() => renameDriveTagKey(document, "valve", "tige")).toThrow(
      'Key "tige" is already used by joint "tige" in assembly "pince". "tige-2" is free.',
    );
  });
});

describe("drive deletion", () => {
  it("refuses to delete a drive that feeds an actuator, naming it", () => {
    const { document } = addDriveToDocument(PRESS, valve("Valve"));
    const fed: PantinDocument = {
      ...document,
      actuators: [
        {
          id: "cylinder",
          name: "Cylinder",
          assembly: "pince",
          type: "double_acting_cylinder",
          extendSpeed: 0.2,
          retractSpeed: 0.2,
          feed: { drive: "valve", ports: { cap: "port_4", rod: "port_2" } },
          joints: ["tige"],
        },
      ],
    };
    expect(() => deleteDriveFromDocument(fed, "valve")).toThrow(
      'Drive "valve" feeds actuator "cylinder". Change its feed or delete it first.',
    );
    expect(deleteDriveFromDocument(document, "valve").drives).toEqual([]);
  });
});
