import type { IoMappingResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { type IoMapping, mappingOf, watchdogTags } from "./io-mapping.ts";

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

describe("mappingOf", () => {
  const answer: IoMappingResponse = {
    status: "valid",
    mappingId: "abc",
    modules: [
      {
        key: "m1",
        port: 1502,
        unitId: 1,
        wordOrder: "low_word_first",
        watchdogMilliseconds: 1000,
        channels: [
          {
            tag: "a.v.coil_1",
            variable: "v",
            zone: "coil",
            address: 0,
            ioType: "BOOL",
            comment: "",
            tagType: "bit",
            direction: "command",
            owner: { kind: "drive", id: "v" },
          },
          {
            tag: "a.gone",
            variable: "gone",
            zone: "coil",
            address: 1,
            ioType: "BOOL",
            comment: "",
            tagType: null,
            direction: null,
            owner: null,
          },
        ],
      },
    ],
    problems: [],
    unmappedTags: [],
  };

  it("keeps the tag, module, type and direction of a valid answer, and skips an unknown tag", () => {
    expect(mappingOf(answer)).toEqual({
      mappingId: "abc",
      rows: [{ tag: "a.v.coil_1", module: "m1", type: "bit", direction: "command" }],
    });
  });

  it("is no mapping for an invalid or missing answer", () => {
    expect(mappingOf({ ...answer, status: "invalid" })).toBeNull();
    expect(mappingOf({ ...answer, status: "missing", mappingId: null })).toBeNull();
  });
});
