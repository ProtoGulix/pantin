import { BridgeStatusSchema } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import type { BridgeMachineState } from "./bridge-state.ts";
import { type BridgeBusFacts, type BridgeStatusInput, buildBridgeStatus } from "./bridge-status.ts";

const IDLE_BUS: BridgeBusFacts = { bridgeConnected: false, plcModules: new Map() };

function inputOf(overrides: Partial<BridgeStatusInput> = {}): BridgeStatusInput {
  return {
    kind: "modbus_tcp_slave",
    availability: "available",
    view: undefined,
    bus: IDLE_BUS,
    listenChoices: ["127.0.0.1"],
    ...overrides,
  };
}

describe("buildBridgeStatus", () => {
  it("shows a never started bridge as stopped, with no network, and obeys the schema", () => {
    for (const kind of ["modbus_tcp_slave", "opcua_client"] as const) {
      const status = buildBridgeStatus(inputOf({ kind }));
      expect(BridgeStatusSchema.parse(status)).toEqual(status);
      expect(status).toMatchObject({
        transport: kind,
        state: "stopped",
        network: null,
        modules: [],
      });
    }
  });

  it("offers the listen choices to the Modbus status only", () => {
    expect(buildBridgeStatus(inputOf())).toHaveProperty("listenChoices", ["127.0.0.1"]);
    expect(buildBridgeStatus(inputOf({ kind: "opcua_client" }))).not.toHaveProperty(
      "listenChoices",
    );
  });

  it("carries the settings of the kind, and drops those of another kind", () => {
    const listenView = {
      state: { phase: "starting" },
      network: { listen: "10.0.0.2", allow: [] as string[] },
      clientCertificate: null,
      log: [],
    } as const;
    const targetsView = {
      state: { phase: "starting" },
      network: { targets: { plc: "10.0.0.9" } },
      clientCertificate: null,
      log: [],
    } as const;
    expect(buildBridgeStatus(inputOf({ view: listenView }))).toMatchObject({
      network: { listen: "10.0.0.2", allow: [] as string[] },
    });
    expect(buildBridgeStatus(inputOf({ kind: "opcua_client", view: targetsView }))).toMatchObject({
      network: { targets: { plc: "10.0.0.9" } },
    });
    expect(
      buildBridgeStatus(inputOf({ kind: "opcua_client", view: listenView })).network,
    ).toBeNull();
  });
});

describe("buildBridgeStatus, client certificate", () => {
  const certificate = { subject: "CN=Pantin", applicationUri: "urn:x", sha256: "a", sha1: "b" };
  const view = {
    state: { phase: "stopped" },
    network: null,
    clientCertificate: certificate,
    log: [],
  } as const;

  it("shows the certificate in the OPC UA status, also when stopped, and not in the Modbus one", () => {
    const status = buildBridgeStatus(inputOf({ kind: "opcua_client", view }));
    expect(BridgeStatusSchema.parse(status)).toEqual(status);
    expect(status).toHaveProperty("clientCertificate", certificate);
    expect(buildBridgeStatus(inputOf({ view }))).not.toHaveProperty("clientCertificate");
  });

  it("is null for a bridge that was never ready", () => {
    expect(buildBridgeStatus(inputOf({ kind: "opcua_client" }))).toHaveProperty(
      "clientCertificate",
      null,
    );
  });
});

describe("buildBridgeStatus, modules and failure", () => {
  it("gives each running module its endpoint, its PLC state and its reason", () => {
    const state: BridgeMachineState = {
      phase: "running",
      modules: [
        { key: "a", endpoint: "opc.tcp://10.0.0.9:4840" },
        { key: "b", endpoint: "opc.tcp://10.0.0.10:4840" },
        { key: "c", endpoint: "opc.tcp://10.0.0.11:4840" },
      ],
    };
    const bus: BridgeBusFacts = {
      bridgeConnected: true,
      plcModules: new Map([
        ["a", { connected: true }],
        ["b", { connected: false, reason: "node_mismatch" }],
      ]),
    };
    const status = buildBridgeStatus(
      inputOf({
        kind: "opcua_client",
        view: { state, network: null, clientCertificate: null, log: [] },
        bus,
      }),
    );
    expect(status.modules).toEqual([
      { key: "a", endpoint: "opc.tcp://10.0.0.9:4840", plcConnected: true, reason: null },
      {
        key: "b",
        endpoint: "opc.tcp://10.0.0.10:4840",
        plcConnected: false,
        reason: "node_mismatch",
      },
      { key: "c", endpoint: "opc.tcp://10.0.0.11:4840", plcConnected: false, reason: null },
    ]);
  });

  it("calls a bridge on the bus external only while Pantin runs none of that kind", () => {
    const bus: BridgeBusFacts = { bridgeConnected: true, plcModules: new Map() };
    const own = {
      state: { phase: "running", modules: [] },
      network: null,
      clientCertificate: null,
      log: [],
    } as const;
    expect(buildBridgeStatus(inputOf({ bus })).externalBridgeConnected).toBe(true);
    expect(buildBridgeStatus(inputOf({ bus, view: own })).externalBridgeConnected).toBe(false);
  });

  it("reports the failure of a failed bridge, and none otherwise", () => {
    const failure = {
      kind: "authentication_failed",
      message: "The PLC refused the password.",
      exitCode: 1,
      signal: null,
      certificate: null,
      module: "plc",
    } as const;
    const failed = {
      state: { phase: "failed", failure },
      network: null,
      clientCertificate: null,
      log: [],
    } as const;
    expect(buildBridgeStatus(inputOf({ kind: "opcua_client", view: failed })).failure).toEqual(
      failure,
    );
    expect(buildBridgeStatus(inputOf()).failure).toBeNull();
  });
});
