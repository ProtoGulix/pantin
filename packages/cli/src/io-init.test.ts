import type { IoDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { freshIoDocument, type InitTag, mapTagsIntoFirstModule } from "./io-init.ts";

// The allocation of `pantin io init` (ADR 0049 point 9), through the core's functions.

const TAGS: InitTag[] = [
  { name: "a.v.coil_1", type: "bit", direction: "command" },
  { name: "a.v.coil_2", type: "bit", direction: "command" },
  { name: "a.s.state", type: "bit", direction: "feedback" },
  { name: "a.j.setpoint", type: "float", direction: "command" },
  { name: "a.j.position", type: "float", direction: "feedback" },
  { name: "a.e.count", type: "integer", direction: "feedback" },
  { name: "a.k.target", type: "integer", direction: "command" },
];

function mapped(document: IoDocument, tags: InitTag[]): IoDocument {
  const result = mapTagsIntoFirstModule(document, tags);
  if (typeof result === "string") {
    throw new Error(result);
  }
  return result;
}

const summary = (document: IoDocument) =>
  (document.modules[0]?.channels ?? []).map(
    (channel) =>
      `${channel.tag} ${channel.variable} ${channel.zone} ${channel.address} ${channel.ioType}`,
  );

describe("freshIoDocument", () => {
  it("has module m1 on port 1502 with the ADR defaults and no channel", () => {
    expect(freshIoDocument()).toEqual({
      schema_version: 1,
      modules: [
        {
          key: "m1",
          port: 1502,
          unitId: 1,
          wordOrder: "low_word_first",
          watchdogMilliseconds: 1000,
          channels: [],
        },
      ],
    });
  });
});

describe("mapTagsIntoFirstModule", () => {
  it("gives each tag its zone and type, and the lowest free address of its zone", () => {
    expect(summary(mapped(freshIoDocument(), TAGS))).toEqual([
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
    const document = freshIoDocument();
    document.modules[0]?.channels.push({
      tag: "other.tag",
      variable: "kept",
      zone: "holding_register",
      address: 2,
      ioType: "REAL",
      comment: "mine",
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
    const document = freshIoDocument();
    document.modules.push({
      key: "m2",
      port: 1503,
      unitId: 1,
      wordOrder: "low_word_first",
      watchdogMilliseconds: 1000,
      channels: [
        {
          tag: "x.y.z",
          variable: "A_V_COIL_1",
          zone: "coil",
          address: 0,
          ioType: "BOOL",
          comment: "",
        },
      ],
    });
    expect(summary(mapped(document, TAGS.slice(0, 1)))).toEqual([
      "a.v.coil_1 a_v_coil_1_2 coil 0 BOOL",
    ]);
  });

  it("explains that module m1 is missing", () => {
    const document = freshIoDocument();
    document.modules = document.modules.map((module) => ({ ...module, key: "m2" }));
    expect(mapTagsIntoFirstModule(document, TAGS)).toContain('no module "m1"');
  });
});
