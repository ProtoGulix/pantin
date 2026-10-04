import { describe, expect, it } from "vitest";
import {
  assemblyChain,
  assemblySubtreeKeys,
  childAssemblies,
  nextPickedAssembly,
} from "./assembly-tree.ts";

const deep = [
  { key: "machine" },
  { key: "carriage", parent: "machine" },
  { key: "bearing", parent: "carriage" },
  { key: "ring", parent: "bearing" },
  { key: "cylinder", parent: "machine" },
];

describe("assemblyChain", () => {
  it("lists the keys from the top level down, over four levels", () => {
    expect(assemblyChain(deep, "ring")).toEqual(["machine", "carriage", "bearing", "ring"]);
    expect(assemblyChain(deep, "machine")).toEqual(["machine"]);
  });

  it("is empty for an unknown key and stops on a loop", () => {
    expect(assemblyChain(deep, "ghost")).toEqual([]);
    const loop = [
      { key: "a", parent: "b" },
      { key: "b", parent: "a" },
    ];
    expect(assemblyChain(loop, "a")).toEqual(["b", "a"]);
  });
});

describe("assemblySubtreeKeys and childAssemblies", () => {
  it("covers every descendant, and direct children only for the second", () => {
    expect(assemblySubtreeKeys(deep, "carriage")).toEqual(new Set(["carriage", "bearing", "ring"]));
    expect(childAssemblies(deep, "machine").map((a) => a.key)).toEqual(["carriage", "cylinder"]);
    expect(childAssemblies(deep, undefined).map((a) => a.key)).toEqual(["machine"]);
  });

  it("treats a flat Pantin as all top level", () => {
    const flat = [{ key: "a" }, { key: "b" }];
    expect(childAssemblies(flat, undefined).map((a) => a.key)).toEqual(["a", "b"]);
  });
});

describe("nextPickedAssembly", () => {
  const chain = ["machine", "carriage", "bearing"];

  it("starts at the top level, whatever the selection that is not on the chain", () => {
    expect(nextPickedAssembly(chain, null, false)).toBe("machine");
    expect(nextPickedAssembly(chain, null, true)).toBe("machine");
    expect(nextPickedAssembly(chain, "cylinder", true)).toBe("machine");
  });

  it("goes one level down per double click, then to the body", () => {
    expect(nextPickedAssembly(chain, "machine", true)).toBe("carriage");
    expect(nextPickedAssembly(chain, "carriage", true)).toBe("bearing");
    expect(nextPickedAssembly(chain, "bearing", true)).toBeNull();
  });

  it("keeps the selected ancestor on a single click", () => {
    expect(nextPickedAssembly(chain, "carriage", false)).toBe("carriage");
  });
});
