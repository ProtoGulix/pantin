import { describe, expect, it } from "vitest";
import { parseArguments } from "./arguments.ts";
import { ConfigurationError } from "./errors.ts";

const BASE = ["--core", "http://127.0.0.1:4800", "--pantin", "press", "--pki-dir", "/pki"];

function refusal(args: readonly string[]): string {
  try {
    parseArguments(args);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigurationError);
    return (error as ConfigurationError).message;
  }
  throw new Error("The command line was accepted.");
}

describe("parseArguments", () => {
  it("reads the command line the core builds", () => {
    const args = parseArguments([
      "--status-lines",
      ...BASE,
      "--target",
      "plc=192.168.1.10",
      "--target",
      "spare=0:0:0:0:0:0:0:1",
      "--trust",
      "AB".repeat(32),
    ]);

    expect(args.statusLines).toBe(true);
    expect(args.core).toEqual({ authority: "127.0.0.1:4800", pantinId: "press" });
    expect(args.pkiDirectory).toBe("/pki");
    expect([...args.targets]).toEqual([
      ["plc", "192.168.1.10"],
      ["spare", "0:0:0:0:0:0:0:1"],
    ]);
    expect(args.trust).toEqual(["ab".repeat(32)]);
  });

  it("is not in status line mode without the flag", () => {
    expect(parseArguments(BASE).statusLines).toBe(false);
  });

  it("normalises a target, IPv4-mapped forms included", () => {
    const args = parseArguments([
      ...BASE,
      "--target",
      "plc=::ffff:192.168.1.10",
      "--target",
      "a=::1",
    ]);

    expect(args.targets.get("plc")).toBe("192.168.1.10");
    expect(args.targets.get("a")).toBe("0:0:0:0:0:0:0:1");
  });

  it("accepts a core URL with an IPv6 loopback address and with localhost", () => {
    expect(parseArguments(["--core", "http://[::1]:4800", ...BASE.slice(2)]).core.authority).toBe(
      "[::1]:4800",
    );
    expect(
      parseArguments(["--core", "http://localhost:4800", ...BASE.slice(2)]).core.authority,
    ).toBe("localhost:4800");
  });

  it.each([
    ["a host name", "plc.local", /host name/i],
    ["localhost", "localhost", /host name/i],
    ["a public address", "8.8.8.8", /public/i],
    ["a mapped public address", "::ffff:8.8.8.8", /public/i],
    ["the wildcard", "0.0.0.0", /0\.0\.0\.0/],
    ["the IPv6 wildcard", "::", /::/],
    ["a link-local address", "169.254.1.1", /link-local/i],
    ["a carrier address", "100.64.0.1", /100\.64/],
    ["a multicast address", "224.0.0.1", /multicast/i],
    ["the broadcast address", "255.255.255.255", /broadcast/i],
    ["another loopback address", "127.0.0.2", /127\.0\.0\.1/],
    ["text with a port", "192.168.1.10:4840", /not an IP address/i],
    ["an empty address", "", /not an IP address/i],
  ])("refuses %s as a target", (_name, address, message) => {
    expect(refusal([...BASE, "--target", `plc=${address}`])).toMatch(message);
  });

  it.each([
    ["no module key", "=192.168.1.10"],
    ["no separator", "192.168.1.10"],
    ["a bad module key", "Bad Key=192.168.1.10"],
  ])("refuses a target with %s", (_name, target) => {
    expect(refusal([...BASE, "--target", target])).toMatch(/<module>=<ip address>/);
  });

  it("refuses a module named twice", () => {
    expect(refusal([...BASE, "--target", "a=127.0.0.1", "--target", "a=127.0.0.1"])).toMatch(
      /twice/,
    );
  });

  it.each([
    ["--core", ["--pantin", "press", "--pki-dir", "/pki"]],
    ["--pantin", ["--core", "http://127.0.0.1:1", "--pki-dir", "/pki"]],
    ["--pki-dir", ["--core", "http://127.0.0.1:1", "--pantin", "press"]],
  ])("requires %s", (option, args) => {
    expect(refusal(args)).toContain(`${option} is required`);
  });

  it.each([
    ["https", "https://127.0.0.1:4800"],
    ["a path", "http://127.0.0.1:4800/api"],
    ["a query", "http://127.0.0.1:4800/?a=1"],
    ["credentials", "http://user:pass@127.0.0.1:4800"],
    ["not a URL", "127.0.0.1:4800"],
  ])("refuses a core URL with %s", (_name, url) => {
    expect(refusal(["--core", url, "--pantin", "press", "--pki-dir", "/pki"])).toMatch(
      /must be http:\/\/<address>:<port>/,
    );
  });

  it.each(["http://8.8.8.8:4800", "http://example.com:4800"])(
    "refuses a core that is not loopback or private (%s)",
    (url) => {
      expect(refusal(["--core", url, "--pantin", "press", "--pki-dir", "/pki"])).toMatch(
        /not a loopback or private address/,
      );
    },
  );

  it("refuses a Pantin id that is not an id", () => {
    expect(
      refusal(["--core", "http://127.0.0.1:1", "--pantin", "../etc", "--pki-dir", "/pki"]),
    ).toMatch(/not a Pantin id/);
  });

  it("refuses a trust entry that is not a SHA-256", () => {
    expect(refusal([...BASE, "--trust", "abc"])).toMatch(/64 hexadecimal/);
  });

  it("refuses an unknown option and a positional argument", () => {
    expect(refusal([...BASE, "--listen", "0.0.0.0"])).toMatch(/Bad command line/);
    expect(refusal([...BASE, "extra"])).toMatch(/Bad command line/);
  });
});
