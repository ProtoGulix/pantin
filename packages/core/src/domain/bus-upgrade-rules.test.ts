import { describe, expect, it } from "vitest";
import { checkUpgradeHeaders, isPlcRoleAccepted } from "./bus-upgrade-rules.ts";
import { type NetworkConfig, resolveNetworkConfig } from "./network-config.ts";

function networkOf(listen: string, allow: string[] = []): NetworkConfig {
  const result = resolveNetworkConfig(listen, allow);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.config;
}

const LOCAL = networkOf("127.0.0.1");
const LAN = networkOf("192.168.1.20");
const NO_HEADERS = { host: "127.0.0.1:4800", origin: undefined, exposure: undefined };

describe("checkUpgradeHeaders", () => {
  it("accepts the core's own Host with no Origin", () => {
    expect(checkUpgradeHeaders(LOCAL, NO_HEADERS, 4800)).toBeNull();
  });

  it("accepts an Origin that is http:// plus an accepted host, case aside", () => {
    for (const origin of [
      "http://127.0.0.1:4800",
      "http://localhost:4800",
      "HTTP://LOCALHOST:4800",
    ]) {
      expect(checkUpgradeHeaders(LOCAL, { ...NO_HEADERS, origin }, 4800)).toBeNull();
    }
  });

  it("accepts the listen address as Origin in lan mode, and not localhost", () => {
    const lan = { host: "192.168.1.20:4800", exposure: undefined };
    expect(
      checkUpgradeHeaders(LAN, { ...lan, origin: "http://192.168.1.20:4800" }, 4800),
    ).toBeNull();
    expect(
      checkUpgradeHeaders(LAN, { ...lan, origin: "http://localhost:4800" }, 4800),
    ).toMatchObject({
      status: 403,
    });
  });

  it("answers 421 for a Host that is not accepted, before looking at the Origin", () => {
    const headers = {
      host: "evil.example:4800",
      origin: "http://evil.example:4800",
      exposure: "x",
    };
    expect(checkUpgradeHeaders(LOCAL, headers, 4800)).toMatchObject({ status: 421 });
    expect(checkUpgradeHeaders(LOCAL, { ...headers, host: undefined }, 4800)).toMatchObject({
      status: 421,
    });
  });

  it("answers 403 for a foreign Origin, before looking at the exposure header", () => {
    const headers = { ...NO_HEADERS, origin: "http://evil.example:4800", exposure: "cloudflare" };
    const refusal = checkUpgradeHeaders(LOCAL, headers, 4800);
    expect(refusal).toMatchObject({ status: 403 });
    expect(refusal?.message).toContain("Origin");
  });

  it("answers 403 for the exposure header, whatever it holds", () => {
    for (const exposure of ["cloudflare", ""]) {
      const refusal = checkUpgradeHeaders(LOCAL, { ...NO_HEADERS, exposure }, 4800);
      expect(refusal).toMatchObject({ status: 403 });
      expect(refusal?.message).toContain("Cloudflare");
    }
  });
});

describe("isPlcRoleAccepted", () => {
  it.each([
    ["127.0.0.1", true],
    ["127.0.0.5", true],
    ["::1", true],
    ["::ffff:127.0.0.1", true],
    ["192.168.1.30", false],
    ["10.0.0.5", false],
    ["8.8.8.8", false],
    ["", false],
    [undefined, false],
  ])("local mode, source %s: %s", (source, accepted) => {
    expect(isPlcRoleAccepted(LOCAL, source)).toBe(accepted);
  });

  it.each([
    ["192.168.1.20", true],
    ["::ffff:192.168.1.20", true],
    ["127.0.0.1", true],
    ["192.168.1.30", false],
    ["10.0.0.5", false],
    ["8.8.8.8", false],
    [undefined, false],
  ])("lan mode on 192.168.1.20, source %s: %s", (source, accepted) => {
    expect(isPlcRoleAccepted(LAN, source)).toBe(accepted);
  });
});
