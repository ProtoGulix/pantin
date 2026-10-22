import type { IoMappedChannel, IoMappingResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { pantinResponse } from "../test-fixtures.ts";
import { NO_IO_STATE, withMapping } from "./io-state.ts";
import { channelCells, channelColumns, creatableKinds } from "./io-transport-view.ts";
import { offeredTagsFor } from "./io-unmapped.ts";
import { buildIoView } from "./io-view-model.ts";

const owner = { kind: "sensor" as const, id: "s" };

const channel = (tag: string, direction: "command" | "feedback", address: number) => ({
  tag,
  variable: tag.replaceAll(".", "_"),
  modbus: { zone: "coil" as const, address, ioType: "BOOL" as const },
  comment: "",
  tagType: "bit" as const,
  direction,
  owner,
});

const moduleOf = (key: string, port: number, channels: IoMappedChannel[]) => ({
  key,
  transport: {
    kind: "modbus_tcp_slave" as const,
    port,
    unitId: 1,
    wordOrder: "low_word_first" as const,
    watchdogMilliseconds: 1000,
  },
  channels,
});

const unmapped = (name: string, direction: "command" | "feedback") => ({
  name,
  type: "bit" as const,
  direction,
  owner,
});

const mapping: IoMappingResponse = {
  status: "valid",
  mappingId: "id",
  modules: [
    moduleOf("m1", 1502, [channel("a.s.up", "feedback", 0), channel("a.v.go", "command", 1)]),
    moduleOf("m2", 1503, [channel("a.s.low", "feedback", 0)]),
  ],
  problems: [],
  unmappedTags: [unmapped("b.s.free", "feedback")],
};

const state = {
  ...withMapping(NO_IO_STATE, pantinResponse(false), mapping),
  units: new Map([["a.s.up", "metre" as const]]),
};

describe("the section of a module", () => {
  it("has a subtitle built from the transport labels, in each language", () => {
    expect(buildIoView(state, new Map(), "fr").sections[0]?.subtitle).toBe(
      "Modbus TCP esclave · Port 1502 · Adresse d'unité 1",
    );
    expect(buildIoView(state, new Map(), "en").sections[1]?.subtitle).toBe(
      "Modbus TCP slave · Port 1503 · Unit id 1",
    );
  });

  it("has the unit of each signal, unknown when the signal list lacks it", () => {
    const rows = buildIoView(state, new Map(), "fr").sections[0]?.rows;
    expect(rows?.map((row) => row.unitKey)).toEqual(["io.unit.metre", "io.unit.unknown"]);
  });

  it("marks the selected module, one section per module", () => {
    const sections = buildIoView(state, new Map(), "fr").sections;
    expect(sections.map((section) => [section.module.key, section.selected])).toEqual([
      ["m1", true],
      ["m2", false],
    ]);
  });
});

describe("the transport columns", () => {
  it("are the transport's own, with its words", () => {
    expect(channelColumns("modbus_tcp_slave", "fr").map((column) => column.label)).toEqual([
      "Zone",
      "Adresse",
      "Type",
    ]);
    const first = mapping.modules[0]?.channels[0] as IoMappedChannel;
    expect(channelCells("modbus_tcp_slave", first, "fr")).toEqual([
      { field: "zone", text: "Bobine", editable: false },
      { field: "address", text: "0", editable: true },
      { field: "ioType", text: "BOOL", editable: false },
    ]);
  });

  it("gives no cell text for a channel without the transport's sub-object", () => {
    const bare: IoMappedChannel = { ...channel("x.y.z", "feedback", 0), modbus: undefined };
    expect(channelCells("modbus_tcp_slave", bare, "en").map((cell) => cell.text)).toEqual([
      "",
      "",
      "",
    ]);
  });
});

describe("the tags offered to a module", () => {
  const names = (moduleKey: string) =>
    offeredTagsFor(mapping, moduleKey).map((tag) => [tag.name, [...tag.alsoIn]]);

  it("offers a feedback mapped in another module, but not a command", () => {
    expect(names("m2")).toEqual([
      ["b.s.free", []],
      ["a.s.up", ["m1"]],
    ]);
  });

  it("does not offer what the module already maps", () => {
    expect(names("m1")).toEqual([
      ["b.s.free", []],
      ["a.s.low", ["m2"]],
    ]);
  });

  it("follows the selected module in the view", () => {
    const second = { ...state, selectedModuleKey: "m2" };
    const offered = buildIoView(second, new Map(), "fr").unmapped.flatMap((group) => group.tags);
    expect(offered.map((tag) => tag.name)).toEqual(["a.s.up", "b.s.free"]);
  });
});

describe("creating a module", () => {
  it("offers every kind of the registry, with its name", () => {
    expect(creatableKinds("en")).toEqual([
      { kind: "modbus_tcp_slave", label: "Modbus TCP slave" },
      { kind: "opcua_client", label: "OPC UA client" },
    ]);
  });
});

describe("Map all", () => {
  it("sends the tags no module maps, not the feedbacks of other modules", () => {
    const second = { ...state, selectedModuleKey: "m2" };
    expect(buildIoView(second, new Map(), "fr").mapAllTags).toEqual(["b.s.free"]);
  });
});
