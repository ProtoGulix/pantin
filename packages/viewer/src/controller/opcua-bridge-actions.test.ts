import type { IoMappingResponse, OpcuaBridgeStatus, SetOpcuaBridgeRequest } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { PantinApiError } from "../api-transport.ts";
import { bridgeListOf, bridgeStatusOf, opcuaStatusOf } from "../bridge/bridge-fixtures.ts";
import { consolePantin } from "../console/console-fixtures.ts";
import { withMapping } from "../io/io-state.ts";
import { withOpenPantin } from "../viewer-state.ts";
import { bridgeIntents, receiveBridge } from "./bridge-actions.ts";
import { flush } from "./bridge-test-helpers.ts";
import { testStore } from "./controller-test-helpers.ts";
import { requestClose, resolvePrompt } from "./session-actions.ts";

// The OPC UA card's intents send the exact PUT bodies (ADR 0065 points 8 to 10).

const MAPPING = {
  status: "valid",
  mappingId: "id",
  modules: [
    {
      key: "plc",
      transport: { kind: "opcua_client", port: 4840, auth: { kind: "anonymous" } },
      channels: [],
    },
    {
      key: "secure",
      transport: { kind: "opcua_client", port: 4841, auth: { kind: "user", userName: "op" } },
      channels: [],
    },
  ],
  problems: [],
  unmappedTags: [],
} as unknown as IoMappingResponse;

function openStore(answer: (request: SetOpcuaBridgeRequest) => OpcuaBridgeStatus | Error) {
  const sent: SetOpcuaBridgeRequest[] = [];
  const modbusSent: unknown[] = [];
  const store = testStore({
    setOpcuaBridge: async (_id, request) => {
      sent.push(request);
      const result = answer(request);
      if (result instanceof Error) {
        throw result;
      }
      return result;
    },
    setBridge: async (_id, request) => {
      modbusSent.push(request);
      return bridgeStatusOf();
    },
    getPantin: async () => consolePantin,
  });
  store.requestedPantinId = consolePantin.id;
  const opened = withOpenPantin(store.state, consolePantin);
  store.update({ ...opened, io: withMapping(opened.io, consolePantin, MAPPING) });
  receiveBridge(store, { bridges: [bridgeStatusOf(), opcuaStatusOf()] });
  return { store, sent, modbusSent, intents: bridgeIntents(store) };
}

const accept = (request: SetOpcuaBridgeRequest) =>
  opcuaStatusOf({ state: request.running ? "starting" : "stopped" });

describe("starting the OPC UA bridge", () => {
  it("sends the targets and the typed passwords, and keeps no password afterwards", async () => {
    const { store, sent, intents } = openStore(accept);
    intents.editOpcuaTarget("plc", "10.0.0.2");
    intents.editOpcuaTarget("secure", "10.0.0.3");
    intents.startOpcuaBridge({ secure: "marker-password" });
    await flush();
    expect(sent).toEqual([
      {
        running: true,
        targets: { plc: "10.0.0.2", secure: "10.0.0.3" },
        passwords: { secure: "marker-password" },
      },
    ]);
    expect(store.bridgeModel.opcua.status?.state).toBe("starting");
    expect(JSON.stringify(store.bridgeModel)).not.toContain("marker-password");
    expect(JSON.stringify(store.state)).not.toContain("marker-password");
  });

  it("omits a password that was not typed, so that the core keeps the stored one", async () => {
    const { sent, intents } = openStore(accept);
    intents.editOpcuaTarget("plc", "10.0.0.2");
    intents.editOpcuaTarget("secure", "10.0.0.3");
    intents.startOpcuaBridge({});
    await flush();
    expect(sent[0]).not.toHaveProperty("passwords");
  });

  it("asks for the missing address instead of sending", async () => {
    const { store, sent, intents } = openStore(accept);
    intents.editOpcuaTarget("plc", "10.0.0.2");
    intents.startOpcuaBridge({});
    await flush();
    expect(sent).toEqual([]);
    expect(store.bridgeModel.opcua.error).toContain("adresse");
  });

  it("shows the core's refusal under the fields", async () => {
    const { store, intents } = openStore(
      () => new PantinApiError("api", "Module secure needs a password.", "invalid_request", 400),
    );
    intents.editOpcuaTarget("plc", "10.0.0.2");
    intents.editOpcuaTarget("secure", "10.0.0.3");
    intents.startOpcuaBridge({});
    await flush();
    expect(store.bridgeModel.opcua.error).toBe("Module secure needs a password.");
    expect(store.bridgeModel.opcua.pending).toBe(false);
  });

  it("restarts after an untrusted certificate with that one certificate and the last targets", async () => {
    const { sent, intents, store } = openStore(accept);
    receiveBridge(store, {
      bridges: [
        bridgeStatusOf(),
        opcuaStatusOf({
          state: "failed",
          network: { targets: { plc: "10.0.0.2", secure: "10.0.0.3" } },
        }),
      ],
    });
    intents.trustAndRestartOpcuaBridge("ab".repeat(32), {});
    await flush();
    expect(sent).toEqual([
      {
        running: true,
        targets: { plc: "10.0.0.2", secure: "10.0.0.3" },
        trust: ["ab".repeat(32)],
      },
    ]);
  });

  it("does not touch the Modbus bridge", async () => {
    const { modbusSent, intents } = openStore(accept);
    intents.editOpcuaTarget("plc", "10.0.0.2");
    intents.editOpcuaTarget("secure", "10.0.0.3");
    intents.startOpcuaBridge({});
    intents.stopOpcuaBridge();
    await flush();
    expect(modbusSent).toEqual([]);
  });
});

describe("closing the Pantin while the OPC UA bridge runs", () => {
  it("offers to stop it, and stops only the bridge that runs", async () => {
    const { store, sent, modbusSent } = openStore(accept);
    receiveBridge(store, bridgeListOf(bridgeStatusOf()));
    receiveBridge(store, { bridges: [bridgeStatusOf(), opcuaStatusOf({ state: "running" })] });
    requestClose(store);
    expect(store.state.closeBridgeNotice).toBe(true);
    await resolvePrompt(store, "stopBridgeAndClose");
    await flush();
    expect(sent).toEqual([{ running: false }]);
    expect(modbusSent).toEqual([]);
  });
});
