import type { IoChannel, IoDocument, IoModule } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { applyVariableAssignments } from "./io-variable-edits.ts";

const channel = (tag: string, variable: string, address: number): IoChannel => ({
  tag,
  variable,
  comment: "",
  modbus: { zone: "coil", address, ioType: "BOOL" },
});

const module = (key: string, port: number, channels: IoChannel[]): IoModule => ({
  key,
  transport: {
    kind: "modbus_tcp_slave",
    port,
    unitId: 1,
    wordOrder: "low_word_first",
    watchdogMilliseconds: 1000,
  },
  channels,
});

const document: IoDocument = {
  schema_version: 2,
  modules: [
    module("m1", 1502, [channel("a.v.coil_1", "one", 0), channel("a.v.coil_2", "two", 1)]),
    module("m2", 1503, [channel("a.v.coil_1", "one", 0)]),
  ],
};

const assignment = (variable: string, tag = "a.v.coil_1", moduleKey = "m1") => ({
  module: moduleKey,
  tag,
  variable,
});

describe("applyVariableAssignments", () => {
  it("sets the variable of each channel and leaves the given document untouched", () => {
    const outcome = applyVariableAssignments(document, [
      assignment("GVL.first"),
      assignment("PLC_PRG.second", "a.v.coil_2"),
    ]);
    expect(outcome.applied).toHaveLength(2);
    expect(outcome.skipped).toEqual([]);
    expect(outcome.document.modules[0]?.channels.map((c) => c.variable)).toEqual([
      "GVL.first",
      "PLC_PRG.second",
    ]);
    expect(document.modules[0]?.channels[0]?.variable).toBe("one");
  });

  it("skips an entry whose module or channel is gone, with a reason, and applies the others", () => {
    const outcome = applyVariableAssignments(document, [
      assignment("x", "a.v.coil_1", "m9"),
      assignment("y", "a.v.coil_9"),
      assignment("GVL.ok", "a.v.coil_2"),
    ]);
    expect(outcome.skipped.map((entry) => entry.reason)).toEqual([
      {
        code: "module_not_found",
        values: { module: "m9" },
        message: expect.stringContaining('no module "m9"'),
      },
      {
        code: "tag_not_mapped",
        values: { tag: "a.v.coil_9", module: "m1" },
        message: expect.stringContaining('"a.v.coil_9" is not mapped in module "m1"'),
      },
    ]);
    expect(outcome.applied).toEqual([assignment("GVL.ok", "a.v.coil_2")]);
  });

  it("skips a variable the PLC rules refuse and says which rule", () => {
    const outcome = applyVariableAssignments(document, [
      assignment("TYPE"),
      assignment("bad__name"),
      assignment("a.b.c.d.e.f.g.h.i"),
    ]);
    expect(outcome.applied).toEqual([]);
    expect(outcome.skipped).toHaveLength(3);
    expect(outcome.skipped.map((entry) => entry.reason.code)).toEqual([
      "variable_reserved_name",
      "variable_invalid_name",
      "variable_too_many_parts",
    ]);
    expect(outcome.skipped[0]?.reason.message).toContain("keyword");
  });

  it("skips a variable another signal holds, ignoring case", () => {
    const outcome = applyVariableAssignments(document, [assignment("TWO")]);
    expect(outcome.applied).toEqual([]);
    expect(outcome.skipped[0]?.reason).toMatchObject({
      code: "variable_shared",
      values: { variable: "TWO", otherTag: "a.v.coil_2" },
    });
    expect(outcome.skipped[0]?.reason.message).toContain("a.v.coil_2");
  });

  it("lets the same signal in two modules share its variable", () => {
    const outcome = applyVariableAssignments(document, [
      assignment("shared"),
      assignment("shared", "a.v.coil_1", "m2"),
    ]);
    expect(outcome.skipped).toEqual([]);
    expect(outcome.applied.map((entry) => entry.module)).toEqual(["m1", "m2"]);
  });

  it("skips both entries that want the same variable, whichever comes first", () => {
    const outcome = applyVariableAssignments(document, [
      assignment("same"),
      assignment("same", "a.v.coil_2"),
    ]);
    expect(outcome.applied).toEqual([]);
    expect(outcome.skipped).toHaveLength(2);
    expect(outcome.document.modules[0]?.channels.map((c) => c.variable)).toEqual(["one", "two"]);
  });

  it("lets two signals swap their variables, since only the final state counts", () => {
    const alone: IoDocument = { ...document, modules: document.modules.slice(0, 1) };
    const outcome = applyVariableAssignments(alone, [
      assignment("two"),
      assignment("one", "a.v.coil_2"),
    ]);
    expect(outcome.skipped).toEqual([]);
    expect(outcome.document.modules[0]?.channels.map((c) => c.variable)).toEqual(["two", "one"]);
  });

  it("puts the old variable of a refused entry back, and checks again: the clash cascades", () => {
    // coil_2 and coil_3 both want "one"; both are refused, coil_2 gets "two" back, which
    // coil_1 was about to take, so coil_1 is refused too and nothing changes.
    const crowded: IoDocument = {
      ...document,
      modules: [
        module("m1", 1502, [
          channel("a.v.coil_1", "one", 0),
          channel("a.v.coil_2", "two", 1),
          channel("a.v.coil_3", "three", 2),
        ]),
      ],
    };
    const outcome = applyVariableAssignments(crowded, [
      assignment("two"),
      assignment("one", "a.v.coil_2"),
      assignment("one", "a.v.coil_3"),
    ]);
    expect(outcome.applied).toEqual([]);
    expect(outcome.skipped.map((entry) => entry.tag).sort()).toEqual([
      "a.v.coil_1",
      "a.v.coil_2",
      "a.v.coil_3",
    ]);
    expect(outcome.document.modules[0]?.channels.map((c) => c.variable)).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("applies the first of two entries for one channel and skips the second", () => {
    const outcome = applyVariableAssignments(document, [assignment("first"), assignment("second")]);
    expect(outcome.applied).toEqual([assignment("first")]);
    expect(outcome.skipped).toHaveLength(1);
    expect(outcome.skipped[0]?.reason).toMatchObject({
      code: "channel_assigned_twice",
      values: {},
    });
  });
});
