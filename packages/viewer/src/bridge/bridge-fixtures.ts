import type { BridgeListResponse, ModbusBridgeStatus, OpcuaBridgeStatus } from "@pantin/protocol";

// Statuses for the tests of the bridge block.

/** The `bridge` event of the stream: the Modbus entry alone, as before the OPC UA card. */
export function bridgeListOf(status: ModbusBridgeStatus): BridgeListResponse {
  return { bridges: [status] };
}

export function bridgeStatusOf(overrides: Partial<ModbusBridgeStatus> = {}): ModbusBridgeStatus {
  return {
    transport: "modbus_tcp_slave",
    availability: "available",
    state: "stopped",
    network: null,
    modules: [],
    failure: null,
    log: [],
    externalBridgeConnected: false,
    listenChoices: ["127.0.0.1", "192.168.56.1"],
    ...overrides,
  };
}

export function opcuaStatusOf(overrides: Partial<OpcuaBridgeStatus> = {}): OpcuaBridgeStatus {
  return {
    transport: "opcua_client",
    availability: "available",
    state: "stopped",
    network: null,
    clientCertificate: null,
    modules: [],
    failure: null,
    log: [],
    externalBridgeConnected: false,
    ...overrides,
  };
}

export const CLIENT_CERTIFICATE = {
  subject: "CN=Pantin OPC UA client",
  applicationUri: "urn:pantin:host:opcua-bridge",
  sha256: "ab".repeat(32),
  sha1: "cd".repeat(20),
};

export const RUNNING_STATUS = bridgeStatusOf({
  state: "running",
  network: { listen: "127.0.0.1", allow: [] },
  modules: [
    { key: "m1", endpoint: "127.0.0.1:1502", plcConnected: true, reason: null },
    { key: "m2", endpoint: "127.0.0.1:1503", plcConnected: false, reason: null },
  ],
});

export const FAILED_STATUS = bridgeStatusOf({
  state: "failed",
  network: { listen: "192.168.56.1", allow: ["192.168.56.10", "192.168.56.0/24"] },
  failure: {
    kind: "configuration",
    message: "port 1502 is taken",
    exitCode: 2,
    signal: null,
    certificate: null,
    module: null,
  },
  log: ["pantin-bridge: port 1502 is taken"],
});
