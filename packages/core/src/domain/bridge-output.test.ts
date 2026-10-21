import { readFileSync } from "node:fs";
import { BRIDGE_MAX_STATUS_LINE_BYTES } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  appendLogLine,
  commonBridgeArguments,
  hostAndPort,
  parseStatusLine,
  splitLines,
} from "./bridge-output.ts";

const FixtureSchema = z.object({
  valid: z.array(z.object({ name: z.string(), message: z.unknown() })),
  invalid: z.array(
    z.object({ name: z.string(), message: z.unknown().optional(), text: z.string().optional() }),
  ),
});
const fixtures = FixtureSchema.parse(
  JSON.parse(
    readFileSync(
      new URL("../../../protocol/fixtures/bridge-status-lines.json", import.meta.url),
      "utf8",
    ),
  ) as unknown,
);

describe("parseStatusLine against the shared fixture", () => {
  it.each(fixtures.valid.map((entry) => [entry.name, entry.message] as const))(
    "reads: %s",
    (_name, message) => {
      expect(parseStatusLine(JSON.stringify(message))).toEqual(message);
    },
  );

  it.each(fixtures.invalid.map((entry) => [entry.name, entry] as const))(
    "treats as a log line: %s",
    (_name, entry) => {
      const line = entry.text ?? JSON.stringify(entry.message);
      expect(parseStatusLine(line)).toBeUndefined();
    },
  );

  it("treats a line over the size limit as a log line", () => {
    const message = "x".repeat(BRIDGE_MAX_STATUS_LINE_BYTES);
    const line = JSON.stringify({ event: "exiting", kind: "unexpected", message });
    expect(parseStatusLine(line)).toBeUndefined();
  });
});

describe("splitLines", () => {
  it("keeps the unfinished end for the next chunk, and drops carriage returns", () => {
    const first = splitLines("", "one\r\ntwo\nthr");
    expect(first).toEqual({ lines: ["one", "two"], pending: "thr" });
    expect(splitLines(first.pending, "ee\n")).toEqual({ lines: ["three"], pending: "" });
  });

  it("flushes a very long line that never ends", () => {
    const split = splitLines("", "y".repeat(70 * 1024));
    expect(split.lines).toHaveLength(1);
    expect(split.pending).toBe("");
  });
});

describe("appendLogLine", () => {
  it("keeps the last 20 lines, each cut to 500 characters", () => {
    let log: string[] = [];
    for (let index = 0; index < 25; index += 1) {
      log = appendLogLine(log, `line ${index}`);
    }
    expect(log).toHaveLength(20);
    expect(log[0]).toBe("line 5");
    expect(appendLogLine([], "z".repeat(900))[0]).toHaveLength(500);
  });
});

describe("commonBridgeArguments", () => {
  it("names the core and the Pantin, with the status lines flag", () => {
    expect(
      commonBridgeArguments({ core: { host: "127.0.0.1", port: 4800 }, pantinId: "axis" }),
    ).toEqual(["--status-lines", "--core", "http://127.0.0.1:4800", "--pantin", "axis"]);
  });

  it("brackets an IPv6 core address in the URL", () => {
    const args = commonBridgeArguments({ core: { host: "::1", port: 4800 }, pantinId: "axis" });
    expect(args).toContain("http://[::1]:4800");
  });
});

describe("hostAndPort", () => {
  it("joins an IPv4 host and a port", () => {
    expect(hostAndPort("192.168.1.10", 1502)).toBe("192.168.1.10:1502");
  });

  it("brackets an IPv6 host", () => {
    expect(hostAndPort("fd00::5", 1502)).toBe("[fd00::5]:1502");
  });
});
