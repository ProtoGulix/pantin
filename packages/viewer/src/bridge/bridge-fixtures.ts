import type { BridgeStatus } from "@pantin/protocol";

// Statuses for the tests of the bridge block.

export function bridgeStatusOf(overrides: Partial<BridgeStatus> = {}): BridgeStatus {
  return {
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

export const RUNNING_STATUS = bridgeStatusOf({
  state: "running",
  network: { listen: "127.0.0.1", allow: [] },
  modules: [
    { key: "m1", port: 1502, plcConnected: true },
    { key: "m2", port: 1503, plcConnected: false },
  ],
});

export const FAILED_STATUS = bridgeStatusOf({
  state: "failed",
  network: { listen: "192.168.56.1", allow: ["192.168.56.10", "192.168.56.0/24"] },
  failure: { kind: "configuration", message: "port 1502 is taken", exitCode: 2, signal: null },
  log: ["pantin-bridge: port 1502 is taken"],
});
