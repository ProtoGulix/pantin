import type { TransportConfig } from "@pantin/protocol";
import type { BridgeStartFacts } from "../domain/bridge-checks.ts";
import { checkOpcuaStart, type OpcuaStartRequest } from "../domain/opcua-bridge-start.ts";
import { createOpcuaTransport } from "./opcua-transport.ts";

// Facts, requests and shortcuts for the tests of the OPC UA start checks.

export const MARKER = "marker-password-4f1c";
export const HASH = "A".repeat(64);

export function transportWith(fields: Record<string, unknown>): TransportConfig {
  return { ...createOpcuaTransport(), ...fields } as TransportConfig; // Test data merged by hand.
}

export const SECURE = { securityMode: "SignAndEncrypt", securityPolicy: "Basic256Sha256" };
export const USER = { auth: { kind: "user", userName: "operator" } };

export function factsWith(
  modules: Record<string, TransportConfig>,
  overrides: Partial<BridgeStartFacts> = {},
): BridgeStartFacts {
  return {
    kind: "opcua_client",
    transportName: "OPC UA client",
    hostAddresses: ["127.0.0.1"],
    mapping: {
      status: "valid",
      modules: Object.keys(modules).map((key) => ({ key, port: null })),
      problems: [],
    },
    externalBridgeConnected: false,
    core: { host: "127.0.0.1", port: 4800 },
    activeBridges: [],
    moduleTransports: Object.entries(modules).map(([key, transport]) => ({ key, transport })),
    storedPasswords: {},
    ...overrides,
  };
}

export function requestWith(fields: Partial<OpcuaStartRequest>): OpcuaStartRequest {
  return { targets: { plc: "127.0.0.1" }, passwords: {}, trust: [], viaExposure: false, ...fields };
}

export function check(
  fields: Partial<OpcuaStartRequest>,
  modules: Record<string, TransportConfig> = { plc: createOpcuaTransport() },
  overrides: Partial<BridgeStartFacts> = {},
) {
  return checkOpcuaStart("axis", requestWith(fields), factsWith(modules, overrides));
}

export function refusalOf(...parameters: Parameters<typeof check>) {
  const result = check(...parameters);
  if (result.ok) {
    throw new Error("Expected a refusal.");
  }
  return result.refusal;
}
