import { describe, expect, it } from "vitest";
import {
  type AddressClass,
  cidrContains,
  classifyAddress,
  formatIpAddress,
  parseCidr,
  parseIpAddress,
} from "./network-address.ts";

const CLASSIFICATION_CASES: [string, AddressClass][] = [
  ["127.0.0.1", "loopback"],
  ["127.255.255.254", "loopback"],
  ["::1", "loopback"],
  ["0:0:0:0:0:0:0:1", "loopback"],
  ["::ffff:127.0.0.1", "loopback"],
  ["10.0.0.1", "private"],
  ["10.255.255.255", "private"],
  ["172.16.0.1", "private"],
  ["172.31.255.255", "private"],
  ["192.168.1.20", "private"],
  ["fc00::1", "private"],
  ["fd12:3456:789a::1", "private"],
  ["::ffff:10.0.0.1", "private"],
  ["::FFFF:192.168.0.1", "private"],
  ["::ffff:c0a8:1", "private"],
  ["0.0.0.0", "wildcard"],
  ["::", "wildcard"],
  ["0:0:0:0:0:0:0:0", "wildcard"],
  ["169.254.0.1", "link-local"],
  ["169.254.255.255", "link-local"],
  ["fe80::1", "link-local"],
  ["febf::1", "link-local"],
  ["172.15.255.255", "public"],
  ["172.32.0.1", "public"],
  ["100.64.0.1", "public"],
  ["100.127.255.255", "public"],
  ["192.169.0.1", "public"],
  ["11.0.0.1", "public"],
  ["8.8.8.8", "public"],
  ["fec0::1", "public"],
  ["fe00::1", "public"],
  ["2001:db8::1", "public"],
  ["::ffff:8.8.8.8", "public"],
  ["localhost", "invalid"],
  ["example.com", "invalid"],
  ["", "invalid"],
  ["256.0.0.1", "invalid"],
  ["10.0.0", "invalid"],
  ["10.0.0.1.2", "invalid"],
  ["010.0.0.1", "invalid"],
  ["10.0.0.1/8", "invalid"],
  [" 10.0.0.1", "invalid"],
  ["1::2::3", "invalid"],
  [":::", "invalid"],
  ["1:2:3:4:5:6:7:8:9", "invalid"],
  ["1:2:3:4:5:6:7", "invalid"],
  ["12345::1", "invalid"],
  ["fe80::1%eth0", "invalid"],
  ["::ffff:300.0.0.1", "invalid"],
  ["[::1]", "invalid"],
];

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
