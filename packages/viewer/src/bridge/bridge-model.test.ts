import type { OpcuaBridgeStatus } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { bridgeListOf, bridgeStatusOf, FAILED_STATUS, RUNNING_STATUS } from "./bridge-fixtures.ts";
import {
  type BridgeModel,
  bridgeAfterStatus,
  bridgeAfterStreamList,
  bridgeStartRequest,
  bridgeWithDraft,
  INITIAL_BRIDGE_MODEL,
  isBridgeActive,
  lanListenOf,
} from "./bridge-model.ts";

const stopped = bridgeAfterStatus(INITIAL_BRIDGE_MODEL, bridgeStatusOf());

function lan(model: BridgeModel, listen: string, allowText: string): BridgeModel {
  return bridgeWithDraft(model, { mode: "lan", listen, allowText });
}

describe("the start request", () => {
  it("is local by default, with no allow list", () => {
    expect(bridgeStartRequest(stopped)).toEqual({
      running: true,
      listen: "127.0.0.1",
      allow: [],
    });
  });

  it("sends the chosen address and the allow entries as typed, split on commas and spaces", () => {
    const model = lan(stopped, "192.168.56.1", "192.168.56.10, 192.168.56.0/24  10.0.0.5;");
    expect(bridgeStartRequest(model)).toEqual({
      running: true,
      listen: "192.168.56.1",
      allow: ["192.168.56.10", "192.168.56.0/24", "10.0.0.5"],
    });
  });

  it("ignores the allow list in local mode", () => {
    const model = bridgeWithDraft(lan(stopped, "192.168.56.1", "10.0.0.5"), {
      mode: "local",
      listen: "192.168.56.1",
      allowText: "10.0.0.5",
    });
    expect(bridgeStartRequest(model)).toEqual({ running: true, listen: "127.0.0.1", allow: [] });
  });

  it("falls back to the first private choice when the chosen address is not offered", () => {
    expect(lanListenOf(lan(stopped, "", ""))).toBe("192.168.56.1");
    expect(lanListenOf(lan(stopped, "8.8.8.8", ""))).toBe("192.168.56.1");
  });
});

describe("a status of the stream", () => {
  it("shows the last network of a failure, so that Restart reuses it", () => {
    const failed = bridgeAfterStatus(stopped, FAILED_STATUS);
    expect(failed.draft).toEqual({
      mode: "lan",
      listen: "192.168.56.1",
      allowText: "192.168.56.10, 192.168.56.0/24",
    });
    expect(bridgeStartRequest(failed)).toEqual({
      running: true,
      listen: "192.168.56.1",
      allow: ["192.168.56.10", "192.168.56.0/24"],
    });
  });

  it("shows a loopback network as the local choice", () => {
    expect(bridgeAfterStatus(stopped, RUNNING_STATUS).draft.mode).toBe("local");
  });

  it("does not overwrite what the user types while the state stays the same", () => {
    const failed = bridgeAfterStatus(stopped, FAILED_STATUS);
    const typed = bridgeWithDraft(failed, { ...failed.draft, allowText: "10.0.0.9" });
    const sameState = bridgeAfterStatus(typed, { ...FAILED_STATUS, log: ["another line"] });
    expect(sameState.draft.allowText).toBe("10.0.0.9");
  });

  it("keeps the draft when the bridge is stopped", () => {
    const typed = lan(stopped, "192.168.56.1", "10.0.0.9");
    expect(bridgeAfterStatus(typed, bridgeStatusOf()).draft).toEqual(typed.draft);
  });

  it("forgets the core's refusal when the state changes, not when the user edits", () => {
    const refused = { ...stopped, networkError: "listen must be private" };
    expect(
      bridgeAfterStatus(refused, bridgeStatusOf({ state: "starting" })).networkError,
    ).toBeNull();
    expect(bridgeWithDraft(refused, refused.draft).networkError).toBe("listen must be private");
  });
});

describe("a bridge that outlives the Pantin", () => {
  it("is active while starting or running only", () => {
    const states = ["stopped", "starting", "running", "stopping", "failed"] as const;
    expect(
      states.map((state) => isBridgeActive(bridgeAfterStatus(stopped, bridgeStatusOf({ state })))),
    ).toEqual([false, true, true, false, false]);
    expect(isBridgeActive(INITIAL_BRIDGE_MODEL)).toBe(false);
  });
});

describe("the list of bridge statuses", () => {
  const opcua: OpcuaBridgeStatus = {
    transport: "opcua_client",
    availability: "available",
    state: "stopped",
    network: null,
    clientCertificate: null,
    modules: [],
    failure: null,
    log: [],
    externalBridgeConnected: false,
  };

  it("keeps every kind and shows the Modbus one", () => {
    const model = bridgeAfterStreamList(INITIAL_BRIDGE_MODEL, {
      bridges: [opcua, RUNNING_STATUS],
    });
    expect([model.statuses, model.status]).toEqual([[opcua, RUNNING_STATUS], RUNNING_STATUS]);
  });

  it("shows an unavailable bridge when the list has no Modbus entry", () => {
    const model = bridgeAfterStreamList(INITIAL_BRIDGE_MODEL, { bridges: [opcua] });
    expect([model.statuses, model.status?.availability, model.status?.state]).toEqual([
      [opcua],
      "unavailable",
      "stopped",
    ]);
  });

  it("replaces only the Modbus entry with the answer of a request", () => {
    const listed = bridgeAfterStreamList(INITIAL_BRIDGE_MODEL, {
      bridges: [opcua, RUNNING_STATUS],
    });
    const stoppedModbus = bridgeStatusOf();
    expect(bridgeAfterStatus(listed, stoppedModbus).statuses).toEqual([opcua, stoppedModbus]);
  });

  it("stays empty until the stream sends a list", () => {
    expect(
      bridgeAfterStreamList(INITIAL_BRIDGE_MODEL, bridgeListOf(bridgeStatusOf())).statuses,
    ).toHaveLength(1);
    expect(INITIAL_BRIDGE_MODEL.statuses).toEqual([]);
  });
});
