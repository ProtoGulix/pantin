import { describe, expect, it } from "vitest";
import { type IoMapping, NO_IO_MAPPING, watchdogTags } from "./io-mapping.ts";

const MAPPING: IoMapping = {
  mappingId: "abc",
  rows: [
    { tag: "a.v.coil_1", module: "m1", type: "bit", direction: "command" },
    { tag: "a.v.coil_2", module: "m2", type: "bit", direction: "command" },
    { tag: "a.j.setpoint", module: "m1", type: "float", direction: "command" },
    { tag: "a.c.count", module: "m1", type: "integer", direction: "feedback" },
    { tag: "a.s.state", module: "m1", type: "bit", direction: "feedback" },
  ],
};

describe("watchdogTags", () => {
  it("keeps the bit commands of one module", () => {
    expect(watchdogTags(MAPPING, "m1")).toEqual(["a.v.coil_1"]);
  });

  it("keeps the bit commands of every module without one", () => {
    expect(watchdogTags(MAPPING)).toEqual(["a.v.coil_1", "a.v.coil_2"]);
  });

  it("finds none on a module with no row", () => {
    expect(watchdogTags(MAPPING, "m9")).toEqual([]);
  });
});

describe("NO_IO_MAPPING", () => {
  it("has no mapping for any Pantin", async () => {
    expect(await NO_IO_MAPPING.read("axis")).toBeNull();
  });
});
