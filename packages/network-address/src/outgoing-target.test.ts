import { describe, expect, it } from "vitest";
import {
  classifyOutgoingTarget,
  type NetworkScope,
  type OutgoingTargetRefusalReason,
} from "./outgoing-target.ts";

function expectRefused(text: string, scope: NetworkScope, reason: OutgoingTargetRefusalReason) {
  const result = classifyOutgoingTarget(text, scope);
  expect(result).toMatchObject({ accepted: false, reason });
  if (!result.accepted) {
    expect(result.message.length).toBeGreaterThan(20);
  }
}

describe("classifyOutgoingTarget accepted targets", () => {
  it.each([
    ["127.0.0.1", "local", "127.0.0.1"],
    ["::1", "local", "0:0:0:0:0:0:0:1"],
    ["::ffff:127.0.0.1", "local", "127.0.0.1"],
    ["10.0.0.5", "lan", "10.0.0.5"],
    ["172.16.0.1", "lan", "172.16.0.1"],
    ["172.31.255.254", "lan", "172.31.255.254"],
    ["192.168.1.10", "lan", "192.168.1.10"],
    ["fd00::10", "lan", "fd00:0:0:0:0:0:0:10"],
    ["::ffff:192.168.1.10", "lan", "192.168.1.10"],
  ] as const)("accepts %s in scope %s", (text, scope, expected) => {
    expect(classifyOutgoingTarget(text, scope)).toEqual({ accepted: true, address: expected });
  });
});

describe("classifyOutgoingTarget refusals", () => {
  it.each(["localhost", "plc.local", "example.com", "my-plc"])("refuses host name %s", (name) => {
    expectRefused(name, "local", "host_name");
    expectRefused(name, "lan", "host_name");
  });

  it.each(["", "10.0.0", "10.0.0.256", "[::1]", "::1%lo", "010.0.0.1", " 10.0.0.1", "1:2:3"])(
    "refuses malformed %j",
    (text) => {
      expectRefused(text, "lan", "invalid_address");
    },
  );

  it.each(["0.0.0.0", "::", "::ffff:0.0.0.0"])("refuses wildcard %s", (text) => {
    expectRefused(text, "local", "wildcard");
    expectRefused(text, "lan", "wildcard");
  });

  it.each(["127.0.0.2", "127.255.255.254"])("refuses other loopback %s in local", (text) => {
    expectRefused(text, "local", "loopback_other_than_standard");
  });

  it.each(["127.0.0.1", "::1", "127.0.0.2"])("refuses loopback %s in lan", (text) => {
    expectRefused(text, "lan", "loopback_not_allowed");
  });

  it.each(["10.0.0.5", "172.16.0.1", "192.168.1.10", "fd00::1", "::ffff:10.0.0.5"])(
    "refuses private %s in local",
    (text) => {
      expectRefused(text, "local", "private_not_allowed_in_local");
    },
  );

  it.each(["8.8.8.8", "172.15.0.1", "172.32.0.1", "192.169.0.1", "2001:db8::1", "240.0.0.1"])(
    "refuses public %s",
    (text) => {
      expectRefused(text, "local", "public");
      expectRefused(text, "lan", "public");
    },
  );

  it.each(["169.254.1.1", "fe80::1", "::ffff:169.254.1.1"])("refuses link-local %s", (text) => {
    expectRefused(text, "local", "link_local");
    expectRefused(text, "lan", "link_local");
  });

  it.each(["224.0.0.1", "239.255.255.250", "ff02::1", "ff00::", "::ffff:224.0.0.1"])(
    "refuses multicast %s",
    (text) => {
      expectRefused(text, "local", "multicast");
      expectRefused(text, "lan", "multicast");
    },
  );

  it.each(["255.255.255.255", "::ffff:255.255.255.255"])("refuses broadcast %s", (text) => {
    expectRefused(text, "local", "broadcast");
    expectRefused(text, "lan", "broadcast");
  });

  it.each(["100.64.0.1", "100.100.100.100", "100.127.255.254", "::ffff:100.64.0.1"])(
    "refuses shared address space %s",
    (text) => {
      expectRefused(text, "local", "shared_address_space");
      expectRefused(text, "lan", "shared_address_space");
    },
  );

  it("does not treat the neighbours of 100.64.0.0/10 as shared", () => {
    expectRefused("100.63.255.255", "lan", "public");
    expectRefused("100.128.0.0", "lan", "public");
  });
});
