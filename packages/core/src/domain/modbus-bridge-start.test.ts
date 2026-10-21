import { describe, expect, it } from "vitest";
import { type BridgeStartFacts, MAX_SUPERVISED_BRIDGES } from "./bridge-checks.ts";
import { checkModbusStart, listenChoicesOf, modbusArguments } from "./modbus-bridge-start.ts";

const FACTS: BridgeStartFacts = {
  kind: "modbus_tcp_slave",
  transportName: "Modbus TCP slave",
  hostAddresses: ["127.0.0.1", "192.168.1.20", "8.8.8.8", "fe80::1", "fd00::5"],
  mapping: { status: "valid", modules: [{ key: "m1", port: 1502 }], problems: [] },
  externalBridgeConnected: false,
  core: { host: "127.0.0.1", port: 4800 },
  activeBridges: [],
  moduleTransports: [],
  storedPasswords: {},
};

function refusalOf(
  listen: string,
  allow: string[],
  facts: Partial<BridgeStartFacts> = {},
  pantinId = "axis",
) {
  const result = checkModbusStart(pantinId, { listen, allow }, { ...FACTS, ...facts });
  if (result.ok) {
    throw new Error("Expected a refusal.");
  }
  return result.refusal;
}

describe("checkModbusStart, listen address", () => {
  it("accepts the loopback address and drops the allow list", () => {
    expect(checkModbusStart("axis", { listen: "127.0.0.1", allow: ["10.0.0.0/8"] }, FACTS)).toEqual(
      {
        ok: true,
        network: { listen: "127.0.0.1", allow: [] },
      },
    );
  });

  it("accepts a private address of the host with an allow list", () => {
    expect(
      checkModbusStart("axis", { listen: "192.168.1.20", allow: ["192.168.1.0/24"] }, FACTS),
    ).toEqual({ ok: true, network: { listen: "192.168.1.20", allow: ["192.168.1.0/24"] } });
  });

  it.each([
    ["0.0.0.0", "every interface"],
    ["::", "every interface"],
    ["8.8.8.8", "not a private address"],
    ["169.254.1.1", "link-local"],
    ["fe80::1", "link-local"],
    ["localhost", "hostnames"],
    ["", "hostnames"],
  ])("refuses %s", (listen, fragment) => {
    const refusal = refusalOf(listen, ["10.0.0.0/8"]);
    expect(refusal.code).toBe("invalid_request");
    expect(refusal.message).toContain(fragment);
  });

  it("refuses a private address that is not one of the host's", () => {
    const refusal = refusalOf("10.9.9.9", ["10.0.0.0/8"]);
    expect(refusal.code).toBe("invalid_request");
    expect(refusal.message).toContain("not an address of this machine");
    expect(refusal.message).toContain("192.168.1.20");
  });
});

describe("checkModbusStart, allow list", () => {
  it("refuses a private address with no allow entry", () => {
    expect(refusalOf("192.168.1.20", []).message).toContain("at least one allowed");
  });

  it("refuses an entry that is not an IP or a CIDR", () => {
    expect(refusalOf("192.168.1.20", ["office"]).message).toContain('"office"');
  });

  it.each(["8.8.8.8", "0.0.0.0/0", "192.168.0.0/8", "169.254.0.0/16"])(
    "refuses %s, outside the private ranges",
    (entry) => {
      expect(refusalOf("192.168.1.20", [entry]).message).toContain("outside the loopback");
    },
  );

  it.each(["192.168.1.0/24", "10.1.2.3", "172.16.0.0/12", "fd00::/8", "127.0.0.1"])(
    "accepts %s",
    (entry) => {
      expect(checkModbusStart("axis", { listen: "192.168.1.20", allow: [entry] }, FACTS).ok).toBe(
        true,
      );
    },
  );
});

describe("checkModbusStart, state of the core", () => {
  it.each([
    ["missing", "no io.json"],
    ["invalid", "The I/O mapping is invalid: io.json: bad"],
  ] as const)("refuses a %s mapping with a conflict", (status, fragment) => {
    const refusal = refusalOf("127.0.0.1", [], {
      mapping: { status, modules: [], problems: ["io.json: bad"] },
    });
    expect(refusal.code).toBe("conflict");
    expect(refusal.message).toContain(fragment);
  });
});

describe("checkModbusStart, slot and ports", () => {
  it("refuses a second bridge for the same Pantin", () => {
    const refusal = refusalOf("127.0.0.1", [], {
      activeBridges: [
        { pantinId: "axis", kind: "modbus_tcp_slave", listen: "127.0.0.1", ports: [1600] },
      ],
    });
    expect(refusal.code).toBe("conflict");
    expect(refusal.message).toContain("already running");
  });

  it("refuses when a bridge started outside Pantin holds the slot", () => {
    const refusal = refusalOf("127.0.0.1", [], { externalBridgeConnected: true });
    expect(refusal.code).toBe("conflict");
    expect(refusal.message).toContain("outside Pantin");
  });

  it("refuses a module port that is the core's own", () => {
    const refusal = refusalOf("127.0.0.1", [], {
      mapping: { status: "valid", modules: [{ key: "m1", port: 4800 }], problems: [] },
    });
    expect(refusal.code).toBe("conflict");
    expect(refusal.message).toContain("where the core itself listens");
  });

  it("allows the core's port number on another address", () => {
    const result = checkModbusStart(
      "axis",
      { listen: "192.168.1.20", allow: ["192.168.1.0/24"] },
      {
        ...FACTS,
        mapping: { status: "valid", modules: [{ key: "m1", port: 4800 }], problems: [] },
      },
    );
    expect(result.ok).toBe(true);
  });

  it("refuses a port held by another Pantin's bridge and names that Pantin", () => {
    const refusal = refusalOf("127.0.0.1", [], {
      activeBridges: [
        { pantinId: "other", kind: "modbus_tcp_slave", listen: "127.0.0.1", ports: [1502] },
      ],
    });
    expect(refusal.code).toBe("conflict");
    expect(refusal.message).toContain("Pantin other");
  });

  it("refuses a fifth bridge", () => {
    const activeBridges = Array.from({ length: MAX_SUPERVISED_BRIDGES }, (_, index) => ({
      pantinId: `p${index}`,
      kind: "modbus_tcp_slave" as const,
      listen: "127.0.0.1",
      ports: [2000 + index],
    }));
    const refusal = refusalOf("127.0.0.1", [], { activeBridges });
    expect(refusal.code).toBe("conflict");
    expect(refusal.message).toContain("4 bridges");
  });
});

describe("listenChoicesOf", () => {
  it("lists the loopback address, then the host's private addresses once each", () => {
    expect(listenChoicesOf([...FACTS.hostAddresses, "192.168.1.20", "169.254.3.3"])).toEqual([
      "127.0.0.1",
      "192.168.1.20",
      "fd00:0:0:0:0:0:0:5",
    ]);
  });
});

describe("checkModbusStart, Modbus modules (ADR 0064 point 8)", () => {
  it("refuses with a 409 when a valid mapping has no Modbus TCP slave module", () => {
    const refusal = refusalOf("127.0.0.1", [], {
      mapping: { status: "valid", modules: [], problems: [] },
    });
    expect(refusal.code).toBe("conflict");
    expect(refusal.message).toContain("no Modbus TCP slave module");
  });
});

describe("modbusArguments", () => {
  it("passes the listen address, then one --allow per entry", () => {
    expect(
      modbusArguments({ listen: "192.168.1.20", allow: ["10.0.0.0/8", "192.168.1.5"] }),
    ).toEqual(["--listen", "192.168.1.20", "--allow", "10.0.0.0/8", "--allow", "192.168.1.5"]);
  });

  it("passes only the listen address on the loopback", () => {
    expect(modbusArguments({ listen: "127.0.0.1", allow: [] })).toEqual(["--listen", "127.0.0.1"]);
  });
});
