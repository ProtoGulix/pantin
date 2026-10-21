import { describe, expect, it } from "vitest";
import { createOpcuaTransport } from "../test-support/opcua-transport.ts";
import type { BridgeStartFacts } from "./bridge-checks.ts";
import { parseBridgeCommand, planBridgeStart, readyModulesOf } from "./bridge-kinds.ts";

const FACTS: BridgeStartFacts = {
  kind: "opcua_client",
  transportName: "OPC UA client",
  hostAddresses: ["127.0.0.1"],
  mapping: { status: "valid", modules: [{ key: "plc", port: null }], problems: [] },
  externalBridgeConnected: false,
  core: { host: "127.0.0.1", port: 4800 },
  activeBridges: [],
  moduleTransports: [{ key: "plc", transport: createOpcuaTransport() }],
  storedPasswords: {},
};

const OPCUA_REQUEST = {
  kind: "opcua_client",
  targets: { plc: "127.0.0.1" },
  passwords: {},
  trust: [],
  viaExposure: false,
} as const;

describe("parseBridgeCommand", () => {
  it("reads a Modbus start with its default empty allow list, and a stop", () => {
    expect(parseBridgeCommand("modbus_tcp_slave", { running: true, listen: "127.0.0.1" })).toEqual({
      running: true,
      start: { kind: "modbus_tcp_slave", listen: "127.0.0.1", allow: [] },
    });
    expect(parseBridgeCommand("modbus_tcp_slave", { running: false })).toEqual({ running: false });
  });

  it("reads an OPC UA start and stop", () => {
    expect(
      parseBridgeCommand("opcua_client", { running: true, targets: { plc: "127.0.0.1" } }),
    ).toEqual({ running: true, start: OPCUA_REQUEST });
    expect(
      parseBridgeCommand("opcua_client", { running: true, targets: { plc: "127.0.0.1" } }, true),
    ).toMatchObject({ start: { viaExposure: true } });
    expect(parseBridgeCommand("opcua_client", { running: false })).toEqual({ running: false });
  });

  it("refuses a body that belongs to no start request of the kind, with a 400", () => {
    expect(() => parseBridgeCommand("modbus_tcp_slave", { running: true })).toThrow(
      "The bridge request",
    );
    expect(() => parseBridgeCommand("opcua_client", { running: false, listen: "x" })).toThrow(
      "The bridge request",
    );
    expect(() => parseBridgeCommand("opcua_client", { running: true })).toThrow(
      "The bridge request",
    );
  });
});

describe("planBridgeStart", () => {
  it("plans a Modbus start: the settings, the address it holds and its command line", () => {
    const facts: BridgeStartFacts = {
      ...FACTS,
      kind: "modbus_tcp_slave",
      transportName: "Modbus TCP slave",
      mapping: { status: "valid", modules: [{ key: "m1", port: 1502 }], problems: [] },
    };
    const result = planBridgeStart(
      "axis",
      { kind: "modbus_tcp_slave", listen: "127.0.0.1", allow: [] },
      facts,
    );
    expect(result).toEqual({
      ok: true,
      plan: {
        network: { listen: "127.0.0.1", allow: [] },
        listen: "127.0.0.1",
        kindArguments: ["--listen", "127.0.0.1"],
        passwords: null,
        unsecuredLanModules: [],
      },
    });
  });

  it("plans an OPC UA start without an address to hold, with the passwords for stdin", () => {
    const result = planBridgeStart("axis", OPCUA_REQUEST, FACTS);
    expect(result).toMatchObject({
      ok: true,
      plan: {
        network: { targets: { plc: "127.0.0.1" } },
        listen: null,
        kindArguments: ["--target", "plc=127.0.0.1"],
        passwords: {},
      },
    });
  });

  it("applies the checks every kind shares to an OPC UA start", () => {
    const noModule = { ...FACTS, mapping: { status: "valid" as const, modules: [], problems: [] } };
    const refused = planBridgeStart("axis", OPCUA_REQUEST, noModule);
    expect(refused).toMatchObject({ ok: false, refusal: { code: "conflict" } });
  });
});

describe("readyModulesOf", () => {
  it("builds the Modbus endpoint from the listen address and the port", () => {
    expect(
      readyModulesOf({
        event: "ready",
        transport: "modbus_tcp_slave",
        listen: "192.168.1.20",
        modules: [{ key: "m1", port: 1502 }],
      }),
    ).toEqual([{ key: "m1", endpoint: "192.168.1.20:1502" }]);
  });

  it("keeps the endpoint an OPC UA bridge reports", () => {
    expect(
      readyModulesOf({
        event: "ready",
        transport: "opcua_client",
        modules: [{ key: "plc", endpoint: "opc.tcp://10.0.0.9:4840" }],
        clientCertificate: {
          subject: "CN=Pantin",
          applicationUri: "urn:x",
          sha256: "a",
          sha1: "b",
        },
      }),
    ).toEqual([{ key: "plc", endpoint: "opc.tcp://10.0.0.9:4840" }]);
  });
});
