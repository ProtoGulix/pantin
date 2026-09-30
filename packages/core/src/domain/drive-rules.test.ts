import {
  type CreateDriveRequest,
  PANTIN_SCHEMA_VERSION,
  type PantinDocument,
} from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { addDriveToDocument, renameDriveTagKey, updateDriveInDocument } from "./drive-rules.ts";

// Drive edits in a document (ADR 0022 points 4 and 8).

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
};

function valve(name = "Tige", assembly = "pince"): CreateDriveRequest {
  return { name, assembly, joints: ["tige"], type: "double_acting_cylinder", speed: 0.2 };
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
      joints: ["tige"],
      type: "servo_axis",
      maxSpeed: 1,
      maxAcceleration: 2,
    };
    expect(updateDriveInDocument(document, drive.id, servo).drive).toMatchObject({
      id: "valve",
      tagKey: "valve",
      type: "servo_axis",
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
