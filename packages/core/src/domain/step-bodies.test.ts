import { PANTIN_SCHEMA_VERSION, type PantinDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { newAssembly } from "./assemblies.ts";
import { stepAssemblyName } from "./step-bodies.ts";

// The assembly a STEP import creates (ADR 0019 point 3).

function component(rootName: string | null, name: string) {
  const leaf = { name, path: [0, 0] };
  return { name, nodes: rootName === null ? [leaf] : [{ name: rootName, path: [0] }, leaf] };
}

const query = { fileName: "parts/Verin pince.step" };

describe("stepAssemblyName", () => {
  it("is the root product when every component shares it", () => {
    const components = [component("ID1S0400125E_0", "a"), component("ID1S0400125E_0", "b")];
    expect(stepAssemblyName(query, components)).toBe("ID1S0400125E_0");
  });

  it("is the file name when the file has several roots", () => {
    const components = [component("FRAME", "a"), component("CYLINDER", "b")];
    expect(stepAssemblyName(query, components)).toBe("Verin pince");
  });

  it("is the file name when the components carry no root name", () => {
    expect(stepAssemblyName(query, [component("  ", "a")])).toBe("Verin pince");
  });
});

describe("newAssembly", () => {
  const document: PantinDocument = {
    schema_version: PANTIN_SCHEMA_VERSION,
    name: "Press",
    assemblies: [{ key: "verin-pince", name: "Verin pince" }],
    bodies: [],
    joints: [],
    drives: [],
  };

  it("derives a unique key from the name and keeps the name as given", () => {
    expect(newAssembly(document, "Verin pince")).toEqual({
      key: "verin-pince-2",
      name: "Verin pince",
    });
  });
});
