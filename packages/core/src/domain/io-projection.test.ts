import {
  IO_SCHEMA_VERSION,
  type IoMappingResponse,
  type IoProblem,
  type TransportConfig,
} from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createOpcuaTransport } from "../test-support/opcua-transport.ts";
import type { IoReading } from "./io-document-text.ts";
import { projectMapping } from "./io-projection.ts";

// A problem that spans modules lands in the projection of the kind of the module it names,
// and in no other (ADR 0065 point 7). The answer for the whole file is crafted here: the
// check of which problem belongs where is the projection's, not the validator's.

const MODBUS_TRANSPORT: TransportConfig = {
  kind: "modbus_tcp_slave",
  port: 1502,
  unitId: 1,
  wordOrder: "low_word_first",
  watchdogMilliseconds: 1000,
};

const MODULES = [
  { key: "press", transport: MODBUS_TRANSPORT, channels: [] },
  { key: "plc_a", transport: createOpcuaTransport("GVL_A"), channels: [] },
  { key: "plc_b", transport: createOpcuaTransport("GVL_B"), channels: [] },
];

const READING: IoReading = {
  kind: "document",
  document: {
    schema_version: IO_SCHEMA_VERSION,
    modules: MODULES,
  },
};

function problem(path: IoProblem["path"], code: IoProblem["code"]): IoProblem {
  return { path, code, message: code };
}

const GVL_A = problem(["modules", 1, "transport", "gvlName"], "gvl_name_mismatch");
const GVL_B = problem(["modules", 2, "transport", "gvlName"], "gvl_name_mismatch");
const TWICE_MODBUS = problem(["modules", 0, "channels", 0, "tag"], "command_mapped_twice");
const TWICE_OPCUA = problem(["modules", 2, "channels", 0, "tag"], "command_mapped_twice");
const WHOLE_FILE = problem(["schema_version"], "newer_schema_version");

function fullWith(problems: IoProblem[]): IoMappingResponse {
  return {
    status: problems.length === 0 ? "valid" : "invalid",
    mappingId: "whole",
    modules: MODULES,
    problems,
    unmappedTags: [],
  };
}

function project(problems: IoProblem[], kind: "modbus_tcp_slave" | "opcua_client") {
  return projectMapping(fullWith(problems), READING, [], kind);
}

describe("a cross-module problem lands in the projection of its own kind only", () => {
  const ALL = [GVL_A, GVL_B, TWICE_MODBUS, TWICE_OPCUA, WHOLE_FILE];

  it("keeps in the Modbus projection its own problem and the whole-file ones", () => {
    const answer = project(ALL, "modbus_tcp_slave");
    expect(answer.problems.map(({ code, path }) => [code, path])).toEqual([
      ["command_mapped_twice", ["modules", 0, "channels", 0, "tag"]],
      ["newer_schema_version", ["schema_version"]],
    ]);
    expect(answer.status).toBe("invalid");
  });

  it("keeps in the OPC UA projection its problems, with paths into its own modules", () => {
    const answer = project(ALL, "opcua_client");
    expect(answer.problems.map(({ code, path }) => [code, path])).toEqual([
      ["gvl_name_mismatch", ["modules", 0, "transport", "gvlName"]],
      ["gvl_name_mismatch", ["modules", 1, "transport", "gvlName"]],
      ["command_mapped_twice", ["modules", 1, "channels", 0, "tag"]],
      ["newer_schema_version", ["schema_version"]],
    ]);
    expect(answer.modules.map(({ key }) => key)).toEqual(["plc_a", "plc_b"]);
  });

  it("leaves the Modbus projection valid, with the same id, whatever the OPC UA modules say", () => {
    const clean = project([], "modbus_tcp_slave");
    const withOpcuaProblems = project([GVL_A, GVL_B, TWICE_OPCUA], "modbus_tcp_slave");
    expect(withOpcuaProblems.status).toBe("valid");
    expect(withOpcuaProblems.problems).toEqual([]);
    expect(withOpcuaProblems.mappingId).toBe(clean.mappingId);
  });

  it("changes the OPC UA projection id when its own problem appears", () => {
    expect(project([GVL_A], "opcua_client").mappingId).not.toBe(
      project([], "opcua_client").mappingId,
    );
  });

  it("leaves the OPC UA projection alone when only a Modbus problem appears", () => {
    const clean = project([], "opcua_client");
    const withModbusProblem = project([TWICE_MODBUS], "opcua_client");
    expect(withModbusProblem.status).toBe("valid");
    expect(withModbusProblem.mappingId).toBe(clean.mappingId);
  });
});
