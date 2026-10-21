import { describe, expect, it } from "vitest";
import {
  type BridgeSharedFacts,
  checkCap,
  checkMapping,
  checkSlot,
  claimedPorts,
  MAX_SUPERVISED_BRIDGES,
  type SupervisedBridgeClaim,
} from "./bridge-checks.ts";

const FACTS: BridgeSharedFacts = {
  kind: "opcua_client",
  transportName: "OPC UA client",
  mapping: { status: "valid", modules: [{ key: "plc", port: null }], problems: [] },
  externalBridgeConnected: false,
  activeBridges: [],
};

function claim(overrides: Partial<SupervisedBridgeClaim> = {}): SupervisedBridgeClaim {
  return {
    pantinId: "axis",
    kind: "modbus_tcp_slave",
    listen: "127.0.0.1",
    ports: [1502],
    ...overrides,
  };
}

describe("checkSlot", () => {
  it("lets the same Pantin start another kind while one kind is held", () => {
    expect(checkSlot("axis", { ...FACTS, activeBridges: [claim()] })).toBeUndefined();
  });

  it("refuses a second bridge of the same kind for the same Pantin", () => {
    const held = claim({ kind: "opcua_client", listen: null, ports: [] });
    expect(checkSlot("axis", { ...FACTS, activeBridges: [held] })?.message).toBe(
      "This Pantin's OPC UA client bridge is already running or starting.",
    );
  });

  it("lets another Pantin hold the same kind", () => {
    const held = claim({ pantinId: "press", kind: "opcua_client", listen: null, ports: [] });
    expect(checkSlot("axis", { ...FACTS, activeBridges: [held] })).toBeUndefined();
  });

  it("refuses when a bridge of the kind started outside Pantin holds the slot", () => {
    expect(checkSlot("axis", { ...FACTS, externalBridgeConnected: true })?.message).toContain(
      "outside Pantin",
    );
  });
});

describe("checkCap", () => {
  it("counts the bridges of every kind", () => {
    const kinds = ["modbus_tcp_slave", "opcua_client"] as const;
    const active = Array.from({ length: MAX_SUPERVISED_BRIDGES }, (_, index) =>
      claim({ pantinId: `p${index}`, kind: kinds[index % 2] ?? "opcua_client" }),
    );
    expect(checkCap(active.length)?.message).toContain("4 bridges");
    expect(checkCap(active.length - 1)).toBeUndefined();
  });
});

describe("checkMapping", () => {
  it("names the kind when a valid mapping has none of its modules", () => {
    const refusal = checkMapping({
      ...FACTS,
      mapping: { status: "valid", modules: [], problems: [] },
    });
    expect(refusal?.code).toBe("conflict");
    expect(refusal?.message).toContain("no OPC UA client module");
  });

  it("refuses a mapping that is not valid, with its first problems", () => {
    const refusal = checkMapping({
      ...FACTS,
      mapping: { status: "invalid", modules: [], problems: ["a is bad"] },
    });
    expect(refusal?.message).toContain("The I/O mapping is invalid: a is bad.");
  });

  it("accepts a valid mapping with a module", () => {
    expect(checkMapping(FACTS)).toBeUndefined();
  });
});

describe("claimedPorts", () => {
  const modules = [
    { key: "a", port: 1502 },
    { key: "b", port: null },
  ];

  it("claims the ports of a kind that listens, leaving out modules with no port", () => {
    expect(claimedPorts("listens", modules)).toEqual([1502]);
  });

  it("claims nothing for a kind that connects out", () => {
    expect(claimedPorts("connects", [{ key: "a", port: 4840 }])).toEqual([]);
  });
});
