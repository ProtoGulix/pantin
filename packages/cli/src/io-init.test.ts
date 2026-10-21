import type { IoTag } from "@pantin/core";
import type { IoDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { freshIoDocument, mapTagsIntoFirstModule } from "./io-init.ts";

// The allocation of `pantin io init` (ADR 0049 point 9), through the core's functions.

const OWNER = { kind: "drive", id: "d" } as const;
const TAGS: IoTag[] = [
  { name: "a.v.coil_1", type: "bit", direction: "command", owner: OWNER },
  { name: "a.v.coil_2", type: "bit", direction: "command", owner: OWNER },
  { name: "a.s.state", type: "bit", direction: "feedback", owner: OWNER },
  { name: "a.j.setpoint", type: "float", direction: "command", owner: OWNER },
  { name: "a.j.position", type: "float", direction: "feedback", owner: OWNER },
  { name: "a.e.count", type: "integer", direction: "feedback", owner: OWNER },
  { name: "a.k.target", type: "integer", direction: "command", owner: OWNER },
];

function mapped(document: IoDocument, tags: IoTag[]): IoDocument {
  const result = mapTagsIntoFirstModule(document, tags);
  if (typeof result === "string") {
    throw new Error(result);
  }
  return result;
}

const summary = (document: IoDocument) =>
  (document.modules[0]?.channels ?? []).map(
    (channel) =>
      `${channel.tag} ${channel.variable} ${channel.modbus?.zone} ${channel.modbus?.address} ${channel.modbus?.ioType}`,
  );

describe("freshIoDocument", () => {
  it("has module m1 on port 1502 with the ADR defaults and no channel", () => {
    expect(freshIoDocument("modbus_tcp_slave")).toEqual({
      schema_version: 2,
      modules: [
        {
          key: "m1",
          transport: {
            kind: "modbus_tcp_slave",
            port: 1502,
            unitId: 1,
            wordOrder: "low_word_first",
            watchdogMilliseconds: 1000,
          },
          channels: [],
        },
      ],
    });
  });
});

describe("mapTagsIntoFirstModule", () => {
  it("gives each tag its zone and type, and the lowest free address of its zone", () => {
    expect(summary(mapped(freshIoDocument("modbus_tcp_slave"), TAGS))).toEqual([
      "a.v.coil_1 a_v_coil_1 coil 0 BOOL",
      "a.v.coil_2 a_v_coil_2 coil 1 BOOL",
      "a.s.state a_s_state discrete_input 0 BOOL",
      "a.j.setpoint a_j_setpoint holding_register 0 REAL",
      "a.j.position a_j_position input_register 0 REAL",
      "a.e.count a_e_count input_register 2 DINT",
      "a.k.target a_k_target holding_register 2 DINT",
    ]);
  });

  it("keeps the existing channels and fills around them, not past the highest", () => {
    const [setpoint] = TAGS.slice(3);
    const document = freshIoDocument("modbus_tcp_slave");
    document.modules[0]?.channels.push({
      tag: "other.tag",
      variable: "kept",
      comment: "mine",
      modbus: { zone: "holding_register", address: 2, ioType: "REAL" },
    });
    const result = mapped(document, setpoint === undefined ? [] : [setpoint]);
    expect(summary(result)).toEqual([
      "other.tag kept holding_register 2 REAL",
      "a.j.setpoint a_j_setpoint holding_register 0 REAL",
    ]);
  });
});

describe("mapTagsIntoFirstModule, other modules", () => {
  it("avoids a variable already used in any module, ignoring case", () => {
    const document = freshIoDocument("modbus_tcp_slave");
    document.modules.push({
      key: "m2",
      transport: {
        kind: "modbus_tcp_slave",
        port: 1503,
        unitId: 1,
        wordOrder: "low_word_first",
        watchdogMilliseconds: 1000,
      },
      channels: [
        {
          tag: "x.y.z",
          variable: "A_V_COIL_1",
          comment: "",
          modbus: { zone: "coil", address: 0, ioType: "BOOL" },
        },
      ],
    });
    expect(summary(mapped(document, TAGS.slice(0, 1)))).toEqual([
      "a.v.coil_1 a_v_coil_1_2 coil 0 BOOL",
    ]);
  });

  it("explains that module m1 is missing", () => {
    const document = freshIoDocument("modbus_tcp_slave");
    document.modules = document.modules.map((module) => ({ ...module, key: "m2" }));
    expect(mapTagsIntoFirstModule(document, TAGS)).toContain('no module "m1"');
  });
});
