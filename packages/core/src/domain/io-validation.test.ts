import type { IoChannel, IoDocument, IoModule } from "@pantin/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { variableProblemOf } from "./io-identifiers.ts";
import { rulesOf } from "./io-transports.ts";
import { type IoTag, validateIoDocument } from "./io-validation.ts";

// The rules common to every transport (ADR 0049 point 6, ADR 0064 point 5),
// with paths into io.json. The Modbus rules are tested in @pantin/transport-types.

const OWNER = { kind: "drive", id: "valve" } as const;
const TAGS: IoTag[] = [
  { name: "a.valve.coil_14", type: "bit", direction: "command", owner: OWNER },
  { name: "a.sw.state", type: "bit", direction: "feedback", owner: OWNER },
  { name: "a.axis.setpoint", type: "float", direction: "command", owner: OWNER },
  { name: "a.axis.position", type: "float", direction: "feedback", owner: OWNER },
];

let counter = 0;
function channel(overrides: Partial<IoChannel> = {}): IoChannel {
  counter += 1;
  return {
    tag: "a.valve.coil_14",
    variable: `var_${counter}`,
    comment: "",
    modbus: { zone: "coil", address: counter, ioType: "BOOL" },
    ...overrides,
  };
}

const feedback = (overrides: Partial<IoChannel> = {}) =>
  channel({
    tag: "a.sw.state",
    modbus: { zone: "discrete_input", address: counter, ioType: "BOOL" },
    ...overrides,
  });

function moduleOf(index: number, channels: IoChannel[], port = 1502 + index): IoModule {
  return {
    key: `m${index + 1}`,
    transport: {
      kind: "modbus_tcp_slave",
      port,
      unitId: 1,
      wordOrder: "low_word_first",
      watchdogMilliseconds: 1000,
    },
    channels,
  };
}

function document(...modules: IoChannel[][]): IoDocument {
  return { schema_version: 2, modules: modules.map((channels, i) => moduleOf(i, channels)) };
}

const problemsOf = (...modules: IoChannel[][]) =>
  validateIoDocument(document(...modules), TAGS).problems;
const codesOf = (...modules: IoChannel[][]) => problemsOf(...modules).map((p) => p.code);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("validateIoDocument tags", () => {
  it("accepts one consistent channel per tag", () => {
    const channels = [
      channel(),
      feedback(),
      channel({
        tag: "a.axis.setpoint",
        modbus: { zone: "holding_register", address: 0, ioType: "REAL" },
      }),
      channel({
        tag: "a.axis.position",
        modbus: { zone: "input_register", address: 0, ioType: "REAL" },
      }),
    ];
    expect(validateIoDocument(document(channels), TAGS)).toEqual({
      problems: [],
      unmappedTags: [],
    });
  });

  it("reports an unknown tag at its tag path", () => {
    expect(problemsOf([channel(), channel({ tag: "a.ghost.coil" })])).toMatchObject([
      { path: ["modules", 0, "channels", 1, "tag"], code: "unknown_tag" },
    ]);
  });

  it("lists as unmapped the tags no channel maps, with type, direction and owner", () => {
    const { unmappedTags } = validateIoDocument(document([channel()]), TAGS);
    expect(unmappedTags.map((tag) => tag.name)).toEqual([
      "a.sw.state",
      "a.axis.setpoint",
      "a.axis.position",
    ]);
    expect(unmappedTags[0]).toEqual({
      name: "a.sw.state",
      type: "bit",
      direction: "feedback",
      owner: OWNER,
    });
  });

  it("asks the transport's rules, and prefixes their paths with the module", () => {
    const wrong = feedback({ modbus: { zone: "coil", address: 0, ioType: "BOOL" } });
    expect(problemsOf([channel()], [wrong])).toMatchObject([
      { path: ["modules", 1, "channels", 0, "modbus", "zone"], code: "zone_direction_mismatch" },
    ]);
  });

  it("reports a signal the transport cannot carry as unsupported_signal", () => {
    const modbusRules = rulesOf({ kind: "modbus_tcp_slave" });
    vi.spyOn(modbusRules, "supportsSignal").mockReturnValue(false);
    expect(problemsOf([channel()])).toMatchObject([
      { path: ["modules", 0, "channels", 0, "tag"], code: "unsupported_signal" },
    ]);
  });
});

describe("validateIoDocument across modules", () => {
  it("accepts a feedback in two modules", () => {
    expect(codesOf([feedback()], [feedback()])).toEqual([]);
  });

  it("reports a command in two modules, on the later channel", () => {
    expect(problemsOf([channel()], [channel()])).toMatchObject([
      { path: ["modules", 1, "channels", 0, "tag"], code: "command_mapped_twice" },
    ]);
  });

  it("reports a port two modules listen on, at the later module's port", () => {
    const shared: IoDocument = {
      schema_version: 2,
      modules: [moduleOf(0, [], 1502), moduleOf(1, [], 1502)],
    };
    expect(validateIoDocument(shared, TAGS).problems).toMatchObject([
      { path: ["modules", 1, "transport", "port"], code: "listen_port_used_twice" },
    ]);
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

  it("accepts a dotted reference to a variable the PLC program declares", () => {
    expect(codesOf([channel({ variable: "GVL_IO.Verin1.FinCourseSortie" })])).toEqual([]);
  });

  it("reports a duplicate variable ignoring case, on the later channel, across modules", () => {
    const problems = problemsOf(
      [channel({ variable: "Valve" })],
      [feedback({ variable: "valve" })],
    );
    expect(problems).toMatchObject([
      { path: ["modules", 1, "channels", 0, "variable"], code: "duplicate_variable" },
    ]);
    expect(problems[0]?.message).toContain('"a.valve.coil_14"');
  });

  it("lets the same tag in two modules share its variable", () => {
    expect(codesOf([feedback({ variable: "limit" })], [feedback({ variable: "LIMIT" })])).toEqual(
      [],
    );
  });

  it("sorts problems by path", () => {
    const problems = problemsOf(
      [channel({ variable: "BOOL" }), channel({ tag: "a.ghost.x" })],
      [feedback({ variable: "INT" })],
    );
    expect(problems.map((p) => p.path.join("."))).toEqual([
      "modules.0.channels.0.variable",
      "modules.0.channels.1.tag",
      "modules.1.channels.0.variable",
    ]);
  });
});
