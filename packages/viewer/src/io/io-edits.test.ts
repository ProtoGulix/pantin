import { describe, expect, it } from "vitest";
import { parseChannelEdit, parseModuleEdit } from "./io-edits.ts";

const KIND = "modbus_tcp_slave";
const request = (value: object) => ({ kind: "request", request: value });
// The settings of a module go in its transport, whose kind is always sent (ADR 0064 point 6).
const transport = (settings: object) => ({
  transport: { kind: "modbus_tcp_slave", ...settings },
});

describe("parseModuleEdit", () => {
  it("parses whole numbers and keeps the other settings untouched", () => {
    expect(parseModuleEdit(KIND, "port", "1503")).toEqual(request(transport({ port: 1503 })));
    expect(parseModuleEdit(KIND, "watchdogMilliseconds", " 500 ")).toEqual(
      request(transport({ watchdogMilliseconds: 500 })),
    );
  });

  it("trims a key and accepts only the two word orders", () => {
    expect(parseModuleEdit(KIND, "key", " plc ")).toEqual(request({ key: "plc" }));
    expect(parseModuleEdit(KIND, "wordOrder", "high_word_first")).toEqual(
      request(transport({ wordOrder: "high_word_first" })),
    );
    expect(parseModuleEdit(KIND, "wordOrder", "other")).toEqual({ kind: "ignored" });
  });

  it("names the field when a number is empty or not a whole number", () => {
    for (const text of ["", "  ", "abc", "1.5", "-2"]) {
      expect(parseModuleEdit(KIND, "unitId", text)).toEqual({
        kind: "invalidNumber",
        field: "unitId",
      });
    }
  });

  it("ignores a field it does not know", () => {
    expect(parseModuleEdit(KIND, "channels", "x")).toEqual({ kind: "ignored" });
  });
});

describe("parseModuleEdit for an OPC UA module", () => {
  const OPCUA = "opcua_client";
  const opcua = (settings: object) => request({ transport: { kind: OPCUA, ...settings } });

  it("sends text settings as typed", () => {
    expect(parseModuleEdit(OPCUA, "nodeIdPrefix", "|var|PLC.Application.")).toEqual(
      opcua({ nodeIdPrefix: "|var|PLC.Application." }),
    );
    expect(parseModuleEdit(OPCUA, "endpointPath", "")).toEqual(opcua({ endpointPath: "" }));
    expect(parseModuleEdit(OPCUA, "gvlName", "GVL_Pantin")).toEqual(
      opcua({ gvlName: "GVL_Pantin" }),
    );
  });

  it("accepts the security choices of the transport only", () => {
    expect(parseModuleEdit(OPCUA, "securityMode", "Sign")).toEqual(opcua({ securityMode: "Sign" }));
    expect(parseModuleEdit(OPCUA, "securityPolicy", "Basic256")).toEqual({ kind: "ignored" });
  });

  it("turns the user name into a login, and an empty one into the anonymous login", () => {
    expect(parseModuleEdit(OPCUA, "userName", " operator ")).toEqual(
      opcua({ auth: { kind: "user", userName: "operator" } }),
    );
    expect(parseModuleEdit(OPCUA, "userName", "  ")).toEqual(
      opcua({ auth: { kind: "anonymous" } }),
    );
  });
});

describe("parseChannelEdit", () => {
  it("edits variable, address and comment", () => {
    expect(parseChannelEdit(KIND, "variable", " valve ")).toEqual(request({ variable: "valve" }));
    expect(parseChannelEdit(KIND, "address", "12")).toEqual(request({ modbus: { address: 12 } }));
    expect(parseChannelEdit(KIND, "comment", " note ")).toEqual(request({ comment: " note " }));
    expect(parseChannelEdit(KIND, "address", "x")).toEqual({
      kind: "invalidNumber",
      field: "address",
    });
  });

  it("does not edit what the core derives", () => {
    expect(parseChannelEdit(KIND, "zone", "coil")).toEqual({ kind: "ignored" });
    expect(parseChannelEdit(KIND, "ioType", "REAL")).toEqual({ kind: "ignored" });
  });
});
