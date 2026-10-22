import { describe, expect, it } from "vitest";
import { OPCUA_IEC_TYPES_BY_SIGNAL_TYPE } from "./iec-types.ts";
import { OPCUA_CLIENT_RULES as rules } from "./rules.ts";
import { derivedIdentifier, isExplicitIdentifierValid } from "./rules-identifiers.ts";
import { defaultOpcuaIecType, isOpcuaIecTypeAllowed } from "./rules-iec-types.ts";
import { BIT_COMMAND, channelOf, created, moduleOf } from "./rules-test-helpers.ts";

describe("the IEC type table", () => {
  it("carries every signal type, with BOOL, REAL and DINT as the defaults", () => {
    expect(defaultOpcuaIecType("bit")).toBe("BOOL");
    expect(defaultOpcuaIecType("float")).toBe("REAL");
    expect(defaultOpcuaIecType("integer")).toBe("DINT");
    expect(OPCUA_IEC_TYPES_BY_SIGNAL_TYPE.integer).toEqual(["DINT", "INT", "LINT"]);
    expect(OPCUA_IEC_TYPES_BY_SIGNAL_TYPE.float).toEqual(["REAL", "LREAL"]);
  });

  it("allows an IEC type for its own signal type only", () => {
    expect(isOpcuaIecTypeAllowed("float", "LREAL")).toBe(true);
    expect(isOpcuaIecTypeAllowed("bit", "REAL")).toBe(false);
    expect(isOpcuaIecTypeAllowed("integer", "REAL")).toBe(false);
  });
});

describe("the identifier of a channel", () => {
  const transport = created({ namespaceUri: "urn:plc", gvlName: "GVL_Sim" });

  it("is derived from the prefix, the GVL name and an undotted variable", () => {
    expect(derivedIdentifier(transport, "extend")).toBe(
      "s=|var|CODESYS Control Win V3 x64.Application.GVL_Sim.extend",
    );
  });

  it("is derived from the prefix and a dotted variable alone", () => {
    expect(derivedIdentifier(transport, "GVL_IO.Cylinder.Out")).toBe(
      "s=|var|CODESYS Control Win V3 x64.Application.GVL_IO.Cylinder.Out",
    );
  });

  it("is the explicit identifier when there is one, and the answer carries it resolved", () => {
    const derived = rules.resolvedChannelFields(transport, channelOf("extend", null));
    expect(derived.opcua?.resolvedIdentifier).toBe(
      "s=|var|CODESYS Control Win V3 x64.Application.GVL_Sim.extend",
    );
    const explicit = rules.resolvedChannelFields(transport, channelOf("extend", "i=42"));
    expect(explicit.opcua).toEqual({
      identifier: "i=42",
      iecType: "BOOL",
      resolvedIdentifier: "i=42",
    });
  });

  it("recognises the two explicit forms", () => {
    expect(isExplicitIdentifierValid("s=a")).toBe(true);
    expect(isExplicitIdentifierValid("i=7")).toBe(true);
    expect(isExplicitIdentifierValid("g=abc")).toBe(false);
  });

  it("names its GVL as the scope of undotted variables", () => {
    expect(rules.variableScope(transport)).toBe("GVL_Sim");
  });
});

describe("the channels of an OPC UA module", () => {
  const module = moduleOf(created({ namespaceUri: "urn:plc" }));

  it("start derived, with the default IEC type of the signal", () => {
    expect(rules.proposeChannel(module, BIT_COMMAND)).toEqual({
      fields: { opcua: { identifier: null, iecType: "BOOL" } },
    });
    expect(rules.proposeChannel(module, { type: "float", direction: "feedback" })).toEqual({
      fields: { opcua: { identifier: null, iecType: "REAL" } },
    });
  });

  it("keep their identifier and a still valid IEC type when the signal is reshaped", () => {
    const channel = channelOf("speed", "s=Node", "LREAL");
    expect(
      rules.reshapeChannel(module, channel, { type: "float", direction: "command" }, false),
    ).toEqual({ fields: { opcua: { identifier: "s=Node", iecType: "LREAL" } } });
  });

  it("fall back to the default IEC type, and to a derived identifier when moved", () => {
    const channel = channelOf("speed", "s=Node", "LREAL");
    expect(
      rules.reshapeChannel(module, channel, { type: "integer", direction: "command" }, true),
    ).toEqual({ fields: { opcua: { identifier: null, iecType: "DINT" } } });
  });

  it("are edited by identifier and IEC type, and null derives the identifier again", () => {
    const channel = channelOf("speed", "s=Node", "REAL");
    expect(rules.patchChannel(channel, { opcua: { iecType: "LREAL" } })).toEqual({
      opcua: { identifier: "s=Node", iecType: "LREAL" },
    });
    expect(rules.patchChannel(channel, { opcua: { identifier: null } })).toEqual({
      opcua: { identifier: null, iecType: "REAL" },
    });
  });

  it("are sorted by tag", () => {
    const sorted = [channelOf("b", null), channelOf("a", null)].toSorted(rules.compareChannels);
    expect(sorted.map((channel) => channel.tag)).toEqual(["a", "b"]);
  });

  it("warn when the PLC variable has another IEC type", () => {
    const channel = channelOf("speed", null, "REAL");
    const feedback = { type: "float", direction: "feedback" } as const;
    expect(
      rules.symbolWarnings(channel, { iecType: "real", access: "read_write" }, feedback),
    ).toEqual([]);
    expect(
      rules.symbolWarnings(channel, { iecType: "LREAL", access: "read_write" }, feedback),
    ).toEqual([
      {
        code: "opcua_type_differs",
        values: { channelType: "REAL", variableType: "LREAL" },
        message:
          "The OPC UA channel is REAL but the PLC variable is LREAL: change the type of the PLC variable to REAL.",
      },
    ]);
  });
});

describe("the access warnings of an OPC UA channel (ADR 0065 point 12)", () => {
  const channel = channelOf("flag", null, "BOOL");
  const command = { type: "bit", direction: "command" } as const;
  const feedback = { type: "bit", direction: "feedback" } as const;
  const bool = (access: "read" | "write" | "read_write" | "unknown") =>
    ({ iecType: "BOOL", access }) as const;

  it("asks a command's variable to be readable", () => {
    expect(rules.symbolWarnings(channel, bool("read"), command)).toEqual([]);
    expect(rules.symbolWarnings(channel, bool("read_write"), command)).toEqual([]);
    expect(rules.symbolWarnings(channel, bool("write"), command)).toMatchObject([
      { code: "opcua_command_not_readable", values: { access: "write" } },
    ]);
  });

  it("asks a feedback's variable to be writable", () => {
    expect(rules.symbolWarnings(channel, bool("write"), feedback)).toEqual([]);
    expect(rules.symbolWarnings(channel, bool("read_write"), feedback)).toEqual([]);
    expect(rules.symbolWarnings(channel, bool("read"), feedback)).toMatchObject([
      { code: "opcua_feedback_not_writable", values: { access: "read" } },
    ]);
  });

  it("does not judge an unknown access", () => {
    expect(rules.symbolWarnings(channel, bool("unknown"), command)).toEqual([]);
    expect(rules.symbolWarnings(channel, bool("unknown"), feedback)).toEqual([]);
  });
});
