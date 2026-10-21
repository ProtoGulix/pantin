import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  type AddressClass,
  cidrContains,
  classifyAddress,
  formatIpAddress,
  parseCidr,
  parseIpAddress,
} from "./network-address.ts";

// Shared with the Python bridge (ADR 0046 point 2): its pytest reads the same file.
const AddressClassSchema = z.enum([
  "loopback",
  "private",
  "wildcard",
  "link-local",
  "public",
  "invalid",
]);
const FixtureSchema = z.object({
  classification: z.array(z.object({ address: z.string(), class: AddressClassSchema })),
});
const CLASSIFICATION_CASES = FixtureSchema.parse(
  JSON.parse(
    readFileSync(new URL("../../protocol/fixtures/address-cases.json", import.meta.url), "utf8"),
  ) as unknown,
).classification.map((entry): [string, AddressClass] => [entry.address, entry.class]);

describe("classifyAddress", () => {
  it.each(CLASSIFICATION_CASES)("classifies %j as %s", (address, expected) => {
    expect(classifyAddress(address)).toBe(expected);
  });
});

describe("parseIpAddress", () => {
  it("normalises IPv4-mapped IPv6 to IPv4", () => {
    expect(parseIpAddress("::ffff:10.0.0.1")).toEqual({ family: 4, bytes: [10, 0, 0, 1] });
  });

  it("expands compressed IPv6", () => {
    const address = parseIpAddress("fd00::a:1");
    expect(address === undefined ? undefined : formatIpAddress(address)).toBe("fd00:0:0:0:0:0:a:1");
  });

  it("accepts a full eight-group IPv6 with an embedded IPv4", () => {
    expect(parseIpAddress("64:ff9b:0:0:0:0:1.2.3.4")?.family).toBe(6);
  });
});

function contains(cidrText: string, addressText: string): boolean {
  const cidr = parseCidr(cidrText);
  const address = parseIpAddress(addressText);
  if (cidr === undefined || address === undefined) {
    throw new Error(`Bad test input ${cidrText} ${addressText}`);
  }
  return cidrContains(cidr, address);
}

describe("CIDR", () => {
  it.each([
    ["192.168.1.0/24", "192.168.1.200", true],
    ["192.168.1.0/24", "192.168.2.1", false],
    ["10.0.0.0/8", "10.200.3.4", true],
    ["172.16.0.0/12", "172.31.0.1", true],
    ["172.16.0.0/12", "172.32.0.1", false],
    ["192.168.1.7", "192.168.1.7", true],
    ["192.168.1.7", "192.168.1.8", false],
    ["192.168.1.7/32", "192.168.1.7", true],
    ["0.0.0.0/0", "8.8.8.8", true],
    ["192.168.1.0/24", "::ffff:192.168.1.9", true],
    ["::ffff:192.168.1.0/120", "192.168.1.9", true],
    ["fd00::/8", "fd12::1", true],
    ["fd00::/8", "fc00::1", false],
    ["fd00::1/128", "fd00::1", true],
    ["fd00::/8", "10.0.0.1", false],
    ["10.0.0.0/8", "fd00::1", false],
    ["10.1.2.3/9", "10.127.0.1", true],
  ])("%s contains %s: %s", (cidr, address, expected) => {
    expect(contains(cidr, address)).toBe(expected);
  });

  it.each([
    "10.0.0.0/33",
    "fd00::/129",
    "10.0.0.0/",
    "10.0.0.0/8/8",
    "10.0.0.0/-1",
    "host/8",
    "::ffff:10.0.0.0/64",
    "10.0.0.0/ 8",
  ])("rejects %j", (text) => {
    expect(parseCidr(text)).toBeUndefined();
  });
});
