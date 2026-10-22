import type { IoDocument, TransportConfig } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createOpcuaTransport } from "../test-support/opcua-transport.ts";
import { moduleProposalsOf } from "./symbol-module-proposals.ts";

const PROJECT = { name: "Axis", deviceName: "Device", applicationName: "Application" };
const SUGGESTED = "|var|Device.Application.";

function documentOf(...modules: IoDocument["modules"]): IoDocument {
  return { schema_version: 2, modules };
}

const modbus: IoDocument["modules"][number] = {
  key: "modbus",
  transport: {
    kind: "modbus_tcp_slave",
    port: 1502,
    unitId: 1,
    wordOrder: "low_word_first",
    watchdogMilliseconds: 1000,
  },
  channels: [],
};

// The helper returns the union; the spread of its fields is the OPC UA member.
function opcua(key: string, nodeIdPrefix: string): IoDocument["modules"][number] {
  return {
    key,
    transport: { ...createOpcuaTransport(), nodeIdPrefix } as TransportConfig,
    channels: [],
  };
}

describe("the module proposals of a symbol file", () => {
  it("proposes the device and application prefix for an OPC UA module", () => {
    expect(moduleProposalsOf(PROJECT, documentOf(opcua("plc", "|var|Other.Application.")))).toEqual(
      [{ module: "plc", nodeIdPrefix: SUGGESTED, reason: "from_project_info" }],
    );
  });

  it("never proposes anything for a Modbus module", () => {
    expect(moduleProposalsOf(PROJECT, documentOf(modbus))).toEqual([]);
  });

  it("proposes nothing for a module that already has the prefix", () => {
    expect(moduleProposalsOf(PROJECT, documentOf(opcua("plc", SUGGESTED)))).toEqual([]);
  });

  it("proposes nothing when the file does not name the project", () => {
    expect(moduleProposalsOf(null, documentOf(opcua("plc", "")))).toEqual([]);
    const noDevice = { ...PROJECT, deviceName: "" };
    expect(moduleProposalsOf(noDevice, documentOf(opcua("plc", "")))).toEqual([]);
    const noApplication = { ...PROJECT, applicationName: "" };
    expect(moduleProposalsOf(noApplication, documentOf(opcua("plc", "")))).toEqual([]);
  });

  it("proposes nothing when the prefix would not fit the setting", () => {
    const longName = { ...PROJECT, deviceName: "D".repeat(300) };
    expect(moduleProposalsOf(longName, documentOf(opcua("plc", "")))).toEqual([]);
  });

  it("keeps one proposal per OPC UA module, in module order", () => {
    const proposals = moduleProposalsOf(
      PROJECT,
      documentOf(opcua("a", ""), modbus, opcua("b", SUGGESTED), opcua("c", "x")),
    );
    expect(proposals.map((proposal) => proposal.module)).toEqual(["a", "c"]);
  });
});
