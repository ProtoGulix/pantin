import { PANTIN_SCHEMA_VERSION, type PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { newAssembly } from "./assemblies.ts";

describe("newAssembly", () => {
  const document: PantinDocument = {
    schema_version: PANTIN_SCHEMA_VERSION,
    name: "Press",
    assemblies: [
      {
        key: "verin-pince",
        name: "Verin pince",
        placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
      },
    ],
    bodies: [],
    joints: [],
    drives: [],
    actuators: [],
    sensors: [],
  };

  it("sets the parent when given", () => {
    expect(newAssembly(document, "Chariot", "verin-pince").parent).toBe("verin-pince");
  });

  it("derives a unique key from the name and keeps the name as given", () => {
    expect(newAssembly(document, "Verin pince")).toEqual({
      key: "verin-pince-2",
      name: "Verin pince",
      placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
    });
  });
});
