import type { IoChannel, IoDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { variableProblemOf } from "./io-identifiers.ts";
import { type IoTag, validateIoDocument } from "./io-validation.ts";

// The rules of ADR 0049 point 6, with paths into io.json.

const OWNER = { kind: "drive", id: "valve" } as const;
const TAGS: IoTag[] = [
  { name: "a.valve.coil_14", type: "bit", direction: "command", owner: OWNER },
  { name: "a.sw.state", type: "bit", direction: "feedback", owner: OWNER },
  { name: "a.axis.setpoint", type: "float", direction: "command", owner: OWNER },
  { name: "a.axis.position", type: "float", direction: "feedback", owner: OWNER },
  { name: "a.enc.count", type: "integer", direction: "feedback", owner: OWNER },
];

let counter = 0;
function channel(overrides: Partial<IoChannel> = {}): IoChannel {
  counter += 1;
  return {
    tag: "a.valve.coil_14",
    variable: `var_${counter}`,
    zone: "coil",
    address: 0,
    ioType: "BOOL",
    comment: "",
    ...overrides,
  };
}

const settings = { unitId: 1, wordOrder: "low_word_first", watchdogMilliseconds: 1000 } as const;

function document(...modules: IoChannel[][]): IoDocument {
  return {
    schema_version: 1,
    modules: modules.map((channels, index) => ({
      key: `m${index + 1}`,
      port: 1502 + index,
      ...settings,
      channels,
    })),
  };
}

function problemsOf(...modules: IoChannel[][]) {
  return validateIoDocument(document(...modules), TAGS).problems;
}

const codesOf = (...modules: IoChannel[][]) => problemsOf(...modules).map((p) => p.code);

describe("validateIoDocument consistent tags", () => {
  it("accepts one consistent channel per tag", () => {
    const channels = [
      channel(),
      channel({ tag: "a.sw.state", zone: "discrete_input" }),
      channel({ tag: "a.axis.setpoint", zone: "holding_register", ioType: "REAL" }),
      channel({ tag: "a.axis.position", zone: "input_register", ioType: "REAL" }),
      channel({ tag: "a.enc.count", zone: "input_register", ioType: "DINT", address: 2 }),
    ];
    expect(validateIoDocument(document(channels), TAGS)).toEqual({
      problems: [],
      unmappedTags: [],
    });
  });
});

describe("validateIoDocument tags", () => {
  it("reports an unknown tag at its tag path", () => {
    expect(problemsOf([channel(), channel({ tag: "a.ghost.coil", address: 1 })])).toMatchObject([
      { path: ["modules", 0, "channels", 1, "tag"], code: "unknown_tag" },
    ]);
  });

  it("reports a zone the direction does not allow, at the zone path", () => {
    const wrong = channel({ tag: "a.sw.state", zone: "coil" });
    expect(problemsOf([wrong])).toMatchObject([
      { path: ["modules", 0, "channels", 0, "zone"], code: "zone_direction_mismatch" },
    ]);
  });

  it("reports an io type the tag type does not give, at the ioType path", () => {
    const wrong = channel({ tag: "a.axis.setpoint", zone: "holding_register", ioType: "DINT" });
    expect(problemsOf([wrong])).toMatchObject([
      { path: ["modules", 0, "channels", 0, "ioType"], code: "type_mismatch" },
    ]);
  });

  it("reports a BOOL in a register zone and a REAL in a bit zone as type_zone_mismatch", () => {
    const wrong = [
      channel({ zone: "holding_register", address: 0 }),
      channel({ tag: "a.axis.setpoint", zone: "coil", ioType: "REAL", address: 4 }),
    ];
    expect(codesOf(wrong)).toContain("type_zone_mismatch");
    expect(problemsOf(wrong).filter((p) => p.code === "type_zone_mismatch")).toHaveLength(2);
  });

  it("lists as unmapped the tags no channel maps, with type, direction and owner", () => {
    const { unmappedTags } = validateIoDocument(document([channel()]), TAGS);
    expect(unmappedTags.map((tag) => tag.name)).toEqual([
      "a.sw.state",
      "a.axis.setpoint",
      "a.axis.position",
      "a.enc.count",
    ]);
    expect(unmappedTags[0]).toEqual({
      name: "a.sw.state",
      type: "bit",
      direction: "feedback",
      owner: OWNER,
    });
  });
});

describe("validateIoDocument addresses", () => {
  it("reports a REAL whose second register runs past 65535, and only that", () => {
    const at = (address: number) =>
      channel({ tag: "a.axis.position", zone: "input_register", ioType: "REAL", address });
    expect(codesOf([at(65534)])).toEqual([]);
    expect(problemsOf([at(65535)])).toMatchObject([
      { path: ["modules", 0, "channels", 0, "address"], code: "address_out_of_range" },
    ]);
  });

  it("reports an overlap on the later channel, per module and zone", () => {
    const position = (address: number) =>
      channel({ tag: "a.axis.position", zone: "input_register", ioType: "REAL", address });
    const count = (address: number) =>
      channel({ tag: "a.enc.count", zone: "input_register", ioType: "DINT", address });
    expect(problemsOf([position(0), count(1)])).toMatchObject([
      { path: ["modules", 0, "channels", 1, "address"], code: "address_overlap" },
    ]);
    expect(codesOf([position(0), count(2)])).toEqual([]);
    // Another module has its own address space.
    expect(codesOf([position(0)], [count(0)])).toEqual([]);
  });

  it("does not count a channel past the end as overlapping", () => {
    const channels = [
      channel({ tag: "a.axis.position", zone: "input_register", ioType: "REAL", address: 65535 }),
      channel({ tag: "a.enc.count", zone: "input_register", ioType: "DINT", address: 65534 }),
    ];
    expect(codesOf(channels)).not.toContain("address_overlap");
  });
});

describe("validateIoDocument variables", () => {
  it("reports an invalid variable at its path, with the identifier rule's message", () => {
    const problems = problemsOf([channel({ variable: "BOOL" })]);
    expect(problems).toMatchObject([
      { path: ["modules", 0, "channels", 0, "variable"], code: "invalid_variable" },
    ]);
    expect(problems[0]?.message).toBe(variableProblemOf("BOOL"));
  });

  it("reports a duplicate variable ignoring case, on the later channel, across modules", () => {
    const first = channel({ variable: "Valve" });
    const second = channel({ tag: "a.sw.state", zone: "discrete_input", variable: "valve" });
    const problems = problemsOf([first], [second]);
    expect(problems).toMatchObject([
      { path: ["modules", 1, "channels", 0, "variable"], code: "duplicate_variable" },
    ]);
    expect(problems[0]?.message).toContain('"a.valve.coil_14"');
  });

  it("sorts problems by path", () => {
    const problems = problemsOf(
      [channel({ variable: "BOOL" }), channel({ tag: "a.ghost.x", address: 1 })],
      [channel({ variable: "INT", tag: "a.sw.state", zone: "discrete_input" })],
    );
    expect(problems.map((p) => p.path.join("."))).toEqual([
      "modules.0.channels.0.variable",
      "modules.0.channels.1.tag",
      "modules.1.channels.0.variable",
    ]);
  });
});
