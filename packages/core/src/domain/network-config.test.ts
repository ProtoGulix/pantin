import { describe, expect, it } from "vitest";
import {
  isHostAccepted,
  isSourceAccepted,
  type NetworkConfig,
  resolveNetworkConfig,
} from "./network-config.ts";

function configFor(listen?: string, allow: string[] = []): NetworkConfig {
  const result = resolveNetworkConfig(listen, allow);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.config;
}

describe("resolveNetworkConfig: startup refusal (ADR 0004)", () => {
  it.each([
    ["8.8.8.8", /not a private address/],
    ["0.0.0.0", /every interface/],
    ["::", /every interface/],
    ["169.254.3.4", /link-local/],
    ["fe80::1", /link-local/],
    ["100.64.0.1", /not a private address/],
    ["localhost", /hostnames are refused/],
    ["pantin.local", /hostnames are refused/],
    ["10.0.0.1,10.0.0.2", /not one literal IP address/],
    ["", /not one literal IP address/],
  ])("refuses to listen on %j", (listen, reason) => {
    const result = resolveNetworkConfig(listen);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toMatch(reason);
  });

  it("refuses an invalid --allow entry", () => {
    const result = resolveNetworkConfig("192.168.1.20", ["192.168.1.0/99"]);
    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining('Invalid --allow "192.168.1.0/99"'),
    });
  });

  it("defaults to local mode on 127.0.0.1", () => {
    expect(configFor()).toMatchObject({ mode: "local", listenAddress: "127.0.0.1", allowlist: [] });
    expect(configFor("::1").mode).toBe("local");
  });

  it("selects lan mode on one private address, normalising mapped IPv6", () => {
    expect(configFor("192.168.1.20").mode).toBe("lan");
    expect(configFor("fd00::20").mode).toBe("lan");
    expect(configFor("::ffff:10.0.0.5")).toMatchObject({ mode: "lan", listenAddress: "10.0.0.5" });
  });
});

describe("isSourceAccepted", () => {
  const lan = configFor("192.168.1.20");

  it.each([
    ["192.168.1.30", true],
    ["::ffff:192.168.1.30", true],
    ["10.1.2.3", true],
    ["fd00::7", true],
    ["127.0.0.1", true],
    ["::1", true],
    ["8.8.8.8", false],
    ["::ffff:8.8.8.8", false],
    ["100.64.1.1", false],
    ["169.254.1.1", false],
    ["2001:db8::1", false],
    ["garbage", false],
  ])("lan mode without allowlist: %s -> %s", (source, expected) => {
    expect(isSourceAccepted(lan, source)).toBe(expected);
  });

  it("refuses a socket without remote address", () => {
    expect(isSourceAccepted(lan, undefined)).toBe(false);
  });

  it("narrows with an allowlist but never widens beyond private ranges", () => {
    const narrowed = configFor("192.168.1.20", ["192.168.1.0/28", "8.8.8.0/24"]);
    expect(isSourceAccepted(narrowed, "192.168.1.5")).toBe(true);
    expect(isSourceAccepted(narrowed, "::ffff:192.168.1.5")).toBe(true);
    expect(isSourceAccepted(narrowed, "192.168.1.100")).toBe(false);
    expect(isSourceAccepted(narrowed, "127.0.0.1")).toBe(false);
    expect(isSourceAccepted(narrowed, "8.8.8.8")).toBe(false);
  });
});

describe("isHostAccepted", () => {
  const local = configFor("127.0.0.1");
  const lan = configFor("192.168.1.20");
  const lanV6 = configFor("fd00::20");

  it.each([
    [local, "127.0.0.1:4800", true],
    [local, "localhost:4800", true],
    [local, "LOCALHOST:4800", true],
    [local, "localhost:4801", false],
    [local, "localhost", false],
    [local, "evil.example:4800", false],
    [local, "192.168.1.20:4800", false],
    [lan, "192.168.1.20:4800", true],
    [lan, "localhost:4800", false],
    [lan, "127.0.0.1:4800", false],
    [lan, "192.168.1.21:4800", false],
    [lan, "evil.example:4800", false],
    [lanV6, "[fd00::20]:4800", true],
    [lanV6, "[FD00:0:0::20]:4800", true],
    [lanV6, "fd00::20:4800", false],
    [lanV6, "[fd00::20]", false],
    [lanV6, "[fd00::21]:4800", false],
  ])("%#: Host %s -> %s", (config, host, expected) => {
    expect(isHostAccepted(config, host, 4800)).toBe(expected);
  });

  it("refuses a missing Host", () => {
    expect(isHostAccepted(local, undefined, 4800)).toBe(false);
  });

  it("accepts [::1] on an IPv6 loopback listener", () => {
    expect(isHostAccepted(configFor("::1"), "[::1]:4800", 4800)).toBe(true);
  });
});
