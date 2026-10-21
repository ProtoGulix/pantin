import { TransportConfigSchema } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  check,
  MARKER,
  refusalOf,
  SECURE,
  transportWith,
  USER,
} from "../test-support/opcua-start-checks.ts";
import { createOpcuaTransport } from "../test-support/opcua-transport.ts";

describe("the targets, every class the address rules refuse (ADR 0065 point 8)", () => {
  it.each([
    ["a host name", "plc.local", "host name"],
    ["localhost", "localhost", "host name"],
    ["a malformed address", "10.0.0", "not an IP address"],
    ["the wildcard 0.0.0.0", "0.0.0.0", "every interface"],
    ["the IPv6 wildcard", "::", "every interface"],
    ["another loopback address", "127.0.0.2", "only 127.0.0.1 or ::1"],
    ["an IPv4-mapped loopback other than the two", "::ffff:127.0.0.2", "only 127.0.0.1 or ::1"],
    ["a public address", "8.8.8.8", "public address"],
    ["a public IPv6 address", "2001:db8::1", "public address"],
    ["a link-local address", "169.254.1.1", "link-local"],
    ["an IPv6 link-local address", "fe80::1", "link-local"],
    ["a multicast address", "224.0.0.1", "multicast"],
    ["the broadcast address", "255.255.255.255", "broadcast"],
    ["the shared address space", "100.64.0.1", "100.64.0.0/10"],
    ["a bracketed address", "[fd00::1]", "not an IP address"],
  ])("refuses %s with a 400 that names the module", (_name, target, text) => {
    const refusal = refusalOf({ targets: { plc: target } });
    expect(refusal.code).toBe("invalid_request");
    expect(refusal.httpStatus).toBeUndefined();
    expect(refusal.message).toContain('"plc"');
    expect(refusal.message).toContain(text);
  });

  it("accepts 127.0.0.1 and ::1 as local, and a private address as lan, normalised", () => {
    for (const [target, address] of [
      ["127.0.0.1", "127.0.0.1"],
      ["::1", "0:0:0:0:0:0:0:1"],
      ["192.168.1.10", "192.168.1.10"],
      ["10.1.2.3", "10.1.2.3"],
      ["172.16.0.9", "172.16.0.9"],
      ["fd00::1", "fd00:0:0:0:0:0:0:1"],
      ["::ffff:192.168.1.10", "192.168.1.10"],
    ] as const) {
      const result = check({ targets: { plc: target } });
      expect(result, target).toMatchObject({
        ok: true,
        plan: { network: { targets: { plc: address } } },
      });
    }
  });
});

describe("the targets match the modules of the kind exactly", () => {
  const modules = { plc: createOpcuaTransport(), second: createOpcuaTransport() };

  it("refuses an unknown key, naming it and the modules", () => {
    const message = refusalOf(
      { targets: { plc: "127.0.0.1", second: "127.0.0.1", ghost: "127.0.0.1" } },
      modules,
    ).message;
    expect(message).toContain('"ghost"');
    expect(message).toContain("plc, second");
  });

  it("refuses a missing key, naming it", () => {
    const refusal = refusalOf({ targets: { plc: "127.0.0.1" } }, modules);
    expect(refusal.code).toBe("invalid_request");
    expect(refusal.message).toContain('"second"');
  });

  it("ignores a module of another kind in the facts", () => {
    const modbus = {
      kind: "modbus_tcp_slave",
      port: 1502,
      unitId: 1,
      wordOrder: "low_word_first",
      watchdogMilliseconds: 1000,
    };
    const result = check(
      {},
      { plc: createOpcuaTransport(), m1: TransportConfigSchema.parse(modbus) },
    );
    expect(result.ok).toBe(true);
  });

  it("does not take inherited names for keys", () => {
    expect(
      refusalOf({ targets: { plc: "127.0.0.1", constructor: "127.0.0.1" } }).message,
    ).toContain('"constructor"');
  });
});

describe("the security of a module toward its target", () => {
  const user = transportWith({ ...USER, securityMode: "None", securityPolicy: "None" });

  it("refuses a user login with security None toward a lan target, naming the endpoint", () => {
    const refusal = refusalOf(
      { targets: { plc: "192.168.1.10" }, passwords: { plc: MARKER } },
      { plc: user },
    );
    expect(refusal.code).toBe("invalid_request");
    expect(refusal.message).toContain("opc.tcp://192.168.1.10:4840");
    expect(refusal.message).not.toContain(MARKER);
  });

  it("allows a user login with security None toward this machine", () => {
    expect(check({ passwords: { plc: MARKER } }, { plc: user })).toMatchObject({
      ok: true,
      plan: { unsecuredLanModules: [] },
    });
  });

  it("allows None toward a lan target and lists the module for the console warning", () => {
    expect(check({ targets: { plc: "192.168.1.10" } })).toMatchObject({
      ok: true,
      plan: { unsecuredLanModules: ["plc"] },
    });
  });

  it("does not warn about a secured module toward a lan target, nor about None toward this machine", () => {
    const secured = check({ targets: { plc: "192.168.1.10" } }, { plc: transportWith(SECURE) });
    expect(secured).toMatchObject({ ok: true, plan: { unsecuredLanModules: [] } });
    expect(check({})).toMatchObject({ ok: true, plan: { unsecuredLanModules: [] } });
  });
});
