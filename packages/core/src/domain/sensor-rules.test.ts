import {
  type CreateSensorRequest,
  PANTIN_SCHEMA_VERSION,
  type PantinDocument,
} from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { addDriveToDocument } from "./drive-rules.ts";
import { addSensorToDocument, renameSensorTagKey, updateSensorInDocument } from "./sensor-rules.ts";

// Sensor edits in a document (ADR 0023 points 3 and 6).

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
    { key: "pince", name: "Pince", placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] } },
    {
      key: "levage",
      name: "Levage",
      placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
    },
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

function limitSwitch(name = "Tige", assembly = "pince"): CreateSensorRequest {
  return {
    name,
    assembly,
    joint: "tige",
    type: "position_switch",
    range: [0.098, 0.1],
    normallyClosed: false,
  };
}

describe("sensor rules", () => {
  it("derives the id and the tag key from the name, the key avoiding joints' and drives' keys", () => {
    const withDrive = addDriveToDocument(PRESS, {
      name: "Tige 2",
      assembly: "pince",
      type: "valve_5_3_closed",
    }).document;
    const { sensor } = addSensorToDocument(withDrive, limitSwitch());
    expect([sensor.id, sensor.tagKey]).toEqual(["tige", "tige-3"]);
  });

  it("keeps the id and the tag key when the sensor changes, the type included", () => {
    const { document } = addSensorToDocument(PRESS, limitSwitch("Sortie"));
    const encoder: CreateSensorRequest = {
      name: "Codeur",
      assembly: "pince",
      joint: "tige",
      type: "encoder",
      pulsesPerUnit: 1000,
    };
    const { sensor } = updateSensorInDocument(document, "sortie", encoder);
    expect(sensor).toEqual({ id: "sortie", tagKey: "sortie", ...encoder });
  });

  it("refuses a move to an assembly where its tag key is taken, without renaming it", () => {
    const withLift = addSensorToDocument(PRESS, limitSwitch("Sortie", "levage")).document;
    const { document } = addSensorToDocument(withLift, limitSwitch("Sortie"));
    expect(() =>
      updateSensorInDocument(document, "sortie-2", limitSwitch("Sortie", "levage")),
    ).toThrow(/Tag key "sortie" of sensor "sortie-2" is already used by sensor "sortie"/);
  });

  it("refuses a tag key used in its assembly, suggesting a free one", () => {
    const { document } = addSensorToDocument(PRESS, limitSwitch("Sortie"));
    expect(() => renameSensorTagKey(document, "sortie", "tige")).toThrow(/"tige-2" is free/);
  });

  it("refuses a sensor on a joint that is not in the Pantin", () => {
    expect(() => addSensorToDocument(PRESS, { ...limitSwitch(), joint: "ghost" })).toThrow(
      /"ghost", which is not a movable joint/,
    );
  });
});
