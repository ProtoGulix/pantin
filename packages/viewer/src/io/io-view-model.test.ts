import type { IoMappingResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { cellIdOf, cellOfPath } from "./io-problems.ts";
import { NO_IO_STATE, withMapping } from "./io-state.ts";
import { assemblyKeyOfTag } from "./io-unmapped.ts";
import { buildIoView } from "./io-view-model.ts";

const channel = (tag: string, address: number) => ({
  tag,
  variable: tag.replaceAll(".", "_"),
  zone: "coil" as const,
  address,
  ioType: "BOOL" as const,
  comment: "",
  tagType: "bit" as const,
  direction: "command" as const,
  owner: { kind: "drive" as const, id: "valve" },
});

const moduleOf = (key: string, port: number, tags: string[]) => ({
  key,
  port,
  unitId: 1,
  wordOrder: "low_word_first" as const,
  watchdogMilliseconds: 1000,
  channels: tags.map((tag, index) => channel(tag, index)),
});

const mapping: IoMappingResponse = {
  status: "invalid",
  mappingId: "id",
  modules: [moduleOf("m1", 1502, ["a.v.x", "a.v.y"]), moduleOf("m2", 1503, ["b.v.z"])],
  problems: [
    { path: ["modules", 0, "channels", 1, "address"], code: "address_overlap", message: "overlap" },
    { path: ["modules", 1, "port"], code: "address_out_of_range", message: "port" },
    { path: [], code: "unknown_tag", message: "whole" },
  ],
  unmappedTags: [
    {
      name: "b.s.q",
      type: "bit",
      direction: "feedback",
      owner: { kind: "sensor", id: "s" },
    },
    { name: "a.s.p", type: "bit", direction: "feedback", owner: { kind: "sensor", id: "s2" } },
  ],
};

const names = new Map([["a", "Alpha"]]);

describe("cellOfPath", () => {
  it("finds the cell of a channel field and of a module setting", () => {
    expect(cellOfPath(["modules", 0, "channels", 3, "address"])).toEqual({
      moduleIndex: 0,
      channelIndex: 3,
      field: "address",
    });
    expect(cellOfPath(["modules", 2, "port"])).toEqual({
      moduleIndex: 2,
      channelIndex: null,
      field: "port",
    });
  });

  it("has no cell for the whole file, a module or a channel", () => {
    expect([[], ["modules", 1], ["modules", 1, "channels", 0]].map(cellOfPath)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("builds distinct ids for a setting and a channel field", () => {
    const ids = [
      cellIdOf({ moduleIndex: 0, channelIndex: null, field: "key" }),
      cellIdOf({ moduleIndex: 0, channelIndex: 1, field: "key" }),
    ];
    expect(new Set(ids).size).toBe(2);
  });
});

describe("buildIoView", () => {
  const state = withMapping(NO_IO_STATE, "press", mapping);
  const view = buildIoView(state, names);

  it("lists modules with channel and problem counts, the first selected", () => {
    expect(view.modules).toEqual([
      { key: "m1", port: 1502, channelCount: 2, problemCount: 1, selected: true },
      { key: "m2", port: 1503, channelCount: 1, problemCount: 1, selected: false },
    ]);
  });

  it("marks problems on their cell and lists whole-file ones without a cell", () => {
    const cellIds = view.problems.map((problem) => problem.cellId);
    expect(cellIds).toEqual(["io-cell-0-1-address", "io-cell-1-port", null]);
    expect(view.selected?.rows[1]?.problems.get("address")).toEqual(["overlap"]);
    expect(view.selected?.rows[0]?.problems.size).toBe(0);
  });

  it("groups unmapped tags by assembly, named from the document", () => {
    expect(view.unmapped.map((group) => [group.assemblyName, group.tags.length])).toEqual([
      ["Alpha", 1],
      ["b", 1],
    ]);
    expect(assemblyKeyOfTag("a.v.x")).toBe("a");
  });

  it("is editable for a mapping with modules and only semantic problems", () => {
    expect(view.mode).toBe("editing");
    expect(view.targetModuleKey).toBe("m1");
  });

  it("is loading, missing or unreadable by the answer", () => {
    const base = { ...mapping, problems: [], modules: [], unmappedTags: [] };
    const modeOf = (answer: IoMappingResponse) =>
      buildIoView(withMapping(NO_IO_STATE, "press", answer), names).mode;
    expect(buildIoView(NO_IO_STATE, names).mode).toBe("loading");
    expect(modeOf({ ...base, status: "missing", mappingId: null })).toBe("missing");
    expect(modeOf({ ...base, status: "invalid", mappingId: null })).toBe("unreadable");
    expect(
      modeOf({
        ...mapping,
        problems: [{ path: [], code: "legacy_io_files", message: "legacy" }],
      }),
    ).toBe("unreadable");
  });

  it("keeps the selection through a refresh and falls back when the module is gone", () => {
    const second = { ...state, selectedModuleKey: "m2" };
    expect(buildIoView(second, names).selected?.module.key).toBe("m2");
    const gone = withMapping(second, "press", { ...mapping, modules: mapping.modules.slice(0, 1) });
    expect(buildIoView(gone, names).selected?.module.key).toBe("m1");
  });
});
