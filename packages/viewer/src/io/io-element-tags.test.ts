import type { IoMappingResponse, IoTagOwner } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { tagsOfOwner } from "./io-element-tags.ts";

const owner: IoTagOwner = { kind: "drive", id: "d1" };
const channel = (tag: string, address: number, who: IoTagOwner | null) => ({
  tag,
  variable: `GVL.${tag}`,
  zone: "coil" as const,
  address,
  ioType: "BOOL" as const,
  comment: "",
  tagType: "bit" as const,
  direction: "command" as const,
  owner: who,
});
const module = (key: string, channels: ReturnType<typeof channel>[]) => ({
  key,
  port: 1502,
  unitId: 1,
  wordOrder: "low_word_first" as const,
  watchdogMilliseconds: 1000,
  channels,
});
const mapping: IoMappingResponse = {
  status: "valid",
  mappingId: "id",
  modules: [
    module("m1", [channel("a.x.one", 0, { kind: "drive", id: "other" })]),
    module("m2", [channel("a.d1.extend", 7, owner)]),
  ],
  problems: [],
  unmappedTags: [
    { name: "a.d1.retract", type: "bit", direction: "command", owner },
    { name: "a.z.go", type: "bit", direction: "command", owner: { kind: "joint", id: "z" } },
  ],
};

describe("tagsOfOwner", () => {
  it("lists the mapped tags of the owner, then its unmapped ones", () => {
    expect(tagsOfOwner(mapping, owner)).toEqual([
      {
        name: "a.d1.extend",
        channel: {
          moduleKey: "m2",
          address: 7,
          variable: "GVL.a.d1.extend",
          cellId: "io-cell-1-0-tag",
        },
      },
      { name: "a.d1.retract", channel: null },
    ]);
  });

  it("is empty without a mapping or for an element without tags", () => {
    expect(tagsOfOwner(null, owner)).toEqual([]);
    expect(tagsOfOwner(mapping, { kind: "sensor", id: "none" })).toEqual([]);
  });
});
