import type { IoMappingResponse } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { RUNNING_STATUS } from "../bridge/bridge-fixtures.ts";
import { bodyOf, documentOf, driveOf } from "../diagram/diagram-fixtures.ts";
import { createTranslator } from "../i18n/translate.ts";
import { NO_IO_STATE, withMapping } from "../io/io-state.ts";
import { initialViewerState, withOpenPantin } from "../viewer-state.ts";
import { buildInspectorIoView, IO_SECTION_ID } from "./io-section.ts";

const t = createTranslator("en");
const pantin = {
  id: "press",
  unsavedChanges: false,
  document: documentOf({
    assemblies: ["a"],
    bodies: [bodyOf("s1", "a")],
    drives: [driveOf("v1", "a")],
  }),
};
const owner = { kind: "drive", id: "v1" } as const;
const mapped = {
  tag: "a.v1.extend",
  variable: "GVL.ext",
  zone: "coil" as const,
  address: 4,
  ioType: "BOOL" as const,
  comment: "",
  tagType: "bit" as const,
  direction: "command" as const,
  owner,
};
const mapping = (modules: IoMappingResponse["modules"]): IoMappingResponse => ({
  status: "valid",
  mappingId: "id",
  modules,
  problems: [],
  unmappedTags: [{ name: "a.v1.retract", type: "bit", direction: "command", owner }],
});
const module = (key: string, channels: IoMappingResponse["modules"][0]["channels"]) => ({
  key,
  port: 1502,
  unitId: 1,
  wordOrder: "low_word_first" as const,
  watchdogMilliseconds: 1000,
  channels,
});

function stateWith(response: IoMappingResponse) {
  const opened = withOpenPantin(initialViewerState("en"), pantin);
  return {
    ...opened,
    selection: owner,
    io: withMapping(NO_IO_STATE, opened.openPantin ?? pantin, response),
  };
}

describe("the inspector I/O section, rows", () => {
  it("lists a mapped tag with module, address and variable, and an unmapped one with Map", () => {
    const view = buildInspectorIoView(stateWith(mapping([module("m1", [mapped])])), t);
    expect(view?.tags.map((tag) => tag.name)).toEqual(["a.v1.extend", "a.v1.retract"]);
    expect(view?.tags[0]).toMatchObject({
      status: "m1 · coil 4",
      mapped: true,
      title: "a.v1.extend · GVL.ext",
      label: "extend",
      connection: { tone: "idle", text: "bridge stopped" },
    });
    expect(view?.tags[0]?.assign).toBeNull();
    expect(view?.tags[1]).toMatchObject({
      status: "not mapped",
      mapped: false,
      connection: null,
      title: "a.v1.retract",
    });
    expect(view?.tags[1]?.assign).toMatchObject({ moduleKey: "m1" });
  });

  it("labels a tag as the element's other sections do, and shows the module's connection", () => {
    const labels = new Map([["a.v1.extend", "Extend coil"]]);
    const view = buildInspectorIoView(
      stateWith(mapping([module("m1", [mapped])])),
      t,
      RUNNING_STATUS,
      labels,
    );
    expect(view?.tags[0]).toMatchObject({ label: "Extend coil", connection: { tone: "ok" } });
    expect(view?.tags[1]?.label).toBe("retract");
  });

  it("is folded like the other sections", () => {
    const state = stateWith(mapping([module("m1", [])]));
    const folded = { ...state, collapsedPropertyGroups: new Set([IO_SECTION_ID]) };
    expect(buildInspectorIoView(state, t)?.collapsed).toBe(false);
    expect(buildInspectorIoView(folded, t)?.collapsed).toBe(true);
  });
});

describe("the inspector I/O section, Map", () => {
  it("disables Map with a reason when there is no module", () => {
    const view = buildInspectorIoView(stateWith(mapping([])), t);
    expect(view?.tags[0]?.assign).toMatchObject({
      moduleKey: null,
      title: "Add a module in the I/O view to map tags.",
    });
  });

  it("maps into the module selected in the I/O view", () => {
    const state = stateWith(mapping([module("m1", []), module("m2", [])]));
    const view = buildInspectorIoView(
      { ...state, io: { ...state.io, selectedModuleKey: "m2" } },
      t,
    );
    expect(view?.tags[0]?.assign?.moduleKey).toBe("m2");
  });
});

describe("the inspector I/O section, when it is shown", () => {
  it("is absent when nothing is selected, the element owns no tag, or the mapping is not loaded", () => {
    const state = stateWith(mapping([module("m1", [])]));
    expect(buildInspectorIoView({ ...state, selection: null }, t)).toBeNull();
    expect(
      buildInspectorIoView({ ...state, selection: { kind: "drive", id: "other" } }, t),
    ).toBeNull();
    expect(buildInspectorIoView({ ...state, io: NO_IO_STATE }, t)).toBeNull();
  });

  it("waits while a request is pending, and for a stale mapping", () => {
    const state = stateWith(mapping([module("m1", [])]));
    expect(buildInspectorIoView({ ...state, pendingRequestCount: 1 }, t)?.busy).toBe(true);
    expect(buildInspectorIoView({ ...state, openPantin: { ...pantin } }, t)).toBeNull();
  });

  it("says the I/O is unavailable, with Retry, after a failed read", () => {
    const state = stateWith(mapping([module("m1", [])]));
    const failed = { ...state, io: { ...NO_IO_STATE, failedFor: state.openPantin } };
    expect(buildInspectorIoView(failed, t)?.unavailable?.text).toBe("I/O unavailable");
    expect(buildInspectorIoView({ ...failed, io: NO_IO_STATE }, t)).toBeNull();
  });
});
