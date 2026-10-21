import type { IoMappingResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { RUNNING_STATUS } from "../bridge/bridge-fixtures.ts";
import { pantinResponse } from "../test-fixtures.ts";
import { cellIdOf, cellOfPath } from "./io-problems.ts";
import { NO_IO_STATE, withMapping } from "./io-state.ts";
import { assemblyKeyOfTag } from "./io-unmapped.ts";
import { buildIoView, type IoView } from "./io-view-model.ts";

const channel = (tag: string, address: number) => ({
  tag,
  variable: tag.replaceAll(".", "_"),
  modbus: { zone: "coil" as const, address, ioType: "BOOL" as const },
  comment: "",
  tagType: "bit" as const,
  direction: "command" as const,
  owner: { kind: "drive" as const, id: "valve" },
});

const moduleOf = (key: string, port: number, tags: string[]) => ({
  key,
  transport: {
    kind: "modbus_tcp_slave" as const,
    port,
    unitId: 1,
    wordOrder: "low_word_first" as const,
    watchdogMilliseconds: 1000,
  },
  channels: tags.map((tag, index) => channel(tag, index)),
});

const mapping: IoMappingResponse = {
  status: "invalid",
  mappingId: "id",
  modules: [moduleOf("m1", 1502, ["a.v.x", "a.v.y"]), moduleOf("m2", 1503, ["b.v.z"])],
  problems: [
    {
      path: ["modules", 0, "channels", 1, "modbus", "address"],
      code: "address_overlap",
      message: "overlap",
    },
    { path: ["modules", 1, "transport", "port"], code: "listen_port_used_twice", message: "port" },
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
const SUBTITLE_1502 = "Modbus TCP esclave · Port 1502 · Adresse d'unité 1";
const SUBTITLE_1503 = "Modbus TCP esclave · Port 1503 · Adresse d'unité 1";
const selectedKeyOf = (view: IoView) =>
  view.sections.find((section) => section.selected)?.module.key;

const PRESS = pantinResponse(false);

describe("cellOfPath", () => {
  it("finds the cell of a channel field and of a module setting", () => {
    expect(cellOfPath(["modules", 0, "channels", 3, "modbus", "address"])).toEqual({
      moduleIndex: 0,
      channelIndex: 3,
      field: "address",
    });
    expect(cellOfPath(["modules", 0, "channels", 3, "variable"])).toEqual({
      moduleIndex: 0,
      channelIndex: 3,
      field: "variable",
    });
    expect(cellOfPath(["modules", 2, "transport", "port"])).toEqual({
      moduleIndex: 2,
      channelIndex: null,
      field: "port",
    });
    expect(cellOfPath(["modules", 2, "key"])).toEqual({
      moduleIndex: 2,
      channelIndex: null,
      field: "key",
    });
  });

  it("has no cell for the whole file, a module or a channel", () => {
    expect(
      [[], ["modules", 1], ["modules", 1, "channels", 0], ["modules", 1, "transport"]].map(
        cellOfPath,
      ),
    ).toEqual([null, null, null, null]);
  });

  it("builds distinct ids for a setting and a channel field", () => {
    const ids = [
      cellIdOf({ moduleIndex: 0, channelIndex: null, field: "key" }),
      cellIdOf({ moduleIndex: 0, channelIndex: 1, field: "key" }),
    ];
    expect(new Set(ids).size).toBe(2);
  });
});

describe("buildIoView connections", () => {
  it("gives each module the connection the bridge reports for it", () => {
    const state = withMapping(NO_IO_STATE, PRESS, mapping);
    const running = buildIoView(state, names, "fr", false, RUNNING_STATUS);
    expect(running.modules.map((module) => module.connection)).toEqual(["connected", "waiting"]);
    expect(running.modules.map((module) => module.statusKey)).toEqual([
      "bridge.module.connected",
      "bridge.module.waiting",
    ]);
  });
});

describe("buildIoView", () => {
  const state = withMapping(NO_IO_STATE, PRESS, mapping);
  const view = buildIoView(state, names, "fr");

  it("lists modules with channel and problem counts, the first selected", () => {
    const stopped = {
      connection: "stopped",
      statusKey: "bridge.module.stopped",
      problemCount: 1,
      problemsKey: "io.module.problems.one",
    } as const;
    expect(view.modules).toEqual([
      {
        ...stopped,
        key: "m1",
        subtitle: SUBTITLE_1502,
        channelCount: 2,
        channelsKey: "io.module.channels.other",
        selected: true,
      },
      {
        ...stopped,
        key: "m2",
        subtitle: SUBTITLE_1503,
        channelCount: 1,
        channelsKey: "io.module.channels.one",
        selected: false,
      },
    ]);
  });

  it("marks problems on their cell and lists whole-file ones without a cell", () => {
    const cellIds = view.problems.map((problem) => problem.cellId);
    expect(cellIds).toEqual(["io-cell-0-1-address", "io-cell-1-port", null]);
    expect(view.sections[0]?.rows[1]?.problems.get("address")).toEqual(["overlap"]);
    expect(view.sections[0]?.rows[0]?.problems.size).toBe(0);
  });
});

describe("buildIoView unmapped tags and modes", () => {
  const state = withMapping(NO_IO_STATE, PRESS, mapping);
  const view = buildIoView(state, names, "fr");

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

  it("keeps offering the unmapped tags when there is no module", () => {
    const empty = { ...mapping, status: "valid" as const, problems: [], modules: [] };
    const none = buildIoView(withMapping(NO_IO_STATE, PRESS, empty), names, "fr");
    expect(none.targetModuleKey).toBeNull();
    expect(none.unmapped.flatMap((group) => group.tags.map((tag) => tag.name))).toEqual([
      "a.s.p",
      "b.s.q",
    ]);
    expect(none.mapAllTags).toEqual(["a.s.p", "b.s.q"]);
  });

  it("is loading, missing or unreadable by the answer", () => {
    const base = { ...mapping, problems: [], modules: [], unmappedTags: [] };
    const modeOf = (answer: IoMappingResponse) =>
      buildIoView(withMapping(NO_IO_STATE, PRESS, answer), names, "fr").mode;
    expect(buildIoView(NO_IO_STATE, names, "fr").mode).toBe("loading");
    expect(modeOf({ ...base, status: "missing", mappingId: null })).toBe("missing");
    expect(modeOf({ ...base, status: "invalid", mappingId: null })).toBe("unreadable");
    expect(
      modeOf({
        ...mapping,
        problems: [{ path: [], code: "invalid_json", message: "broken" }],
      }),
    ).toBe("unreadable");
  });

  it("keeps the selection through a refresh and falls back when the module is gone", () => {
    const second = { ...state, selectedModuleKey: "m2" };
    expect(selectedKeyOf(buildIoView(second, names, "fr"))).toBe("m2");
    const gone = withMapping(second, PRESS, { ...mapping, modules: mapping.modules.slice(0, 1) });
    expect(selectedKeyOf(buildIoView(gone, names, "fr"))).toBe("m1");
  });
});

describe("a failed read", () => {
  const failedFor = pantinResponse(false);

  it("is an error state when nothing was read", () => {
    const view = buildIoView({ ...NO_IO_STATE, failedFor }, new Map(), "fr");
    expect(view.mode).toBe("failed");
    expect(view.outOfDate).toBe(false);
  });

  it("marks a mapping read before as possibly out of date", () => {
    const read = withMapping(NO_IO_STATE, PRESS, mapping);
    const view = buildIoView({ ...read, failedFor: { ...PRESS } }, new Map(), "fr");
    expect(view.mode).toBe("editing");
    expect(view.outOfDate).toBe(true);
    expect(buildIoView(read, new Map(), "fr").outOfDate).toBe(false);
  });
});
