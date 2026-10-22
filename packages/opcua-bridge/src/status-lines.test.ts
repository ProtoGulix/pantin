import { readFileSync } from "node:fs";
import { BRIDGE_MAX_STATUS_LINE_BYTES, BridgeStatusLineSchema } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { BusClosedError, ConfigurationError, type ExitDetails } from "./errors.ts";
import { createStatusLines, encodeExitingLine, encodeReadyLine } from "./status-lines.ts";

type FixtureEntry = { name: string; message: Record<string, unknown> };
const fixture = JSON.parse(
  readFileSync(
    new URL("../../protocol/fixtures/bridge-status-lines.json", import.meta.url),
    "utf8",
  ),
) as { valid: FixtureEntry[] };

const CERTIFICATE = {
  subject: "CN=Pantin",
  applicationUri: "urn:pantin:workshop:opcua-bridge",
  sha256: "c".repeat(64),
  sha1: "d".repeat(40),
};

describe("status lines", () => {
  it("writes the ready line of the shared fixture", () => {
    const entry = fixture.valid.find(
      ({ name }) => name === "opcua ready with two modules and an endpoint path",
    );

    const line = encodeReadyLine(
      [
        { key: "plc", endpoint: "opc.tcp://192.168.1.20:4840/ua" },
        { key: "spare", endpoint: "opc.tcp://[fd00::1]:4841" },
      ],
      CERTIFICATE,
    );

    expect(JSON.parse(line)).toEqual(entry?.message);
    expect(BridgeStatusLineSchema.safeParse(JSON.parse(line)).success).toBe(true);
  });

  it("writes every exiting line of the shared fixture that has no certificate and no module", () => {
    const entries = fixture.valid.filter(
      ({ message }) =>
        message.event === "exiting" && message.certificate === null && message.module === null,
    );

    expect(entries.length).toBeGreaterThan(5);
    for (const { message } of entries) {
      const line = encodeExitingLine(
        message.kind as Parameters<typeof encodeExitingLine>[0], // the fixture holds valid kinds
        String(message.message),
      );
      expect(JSON.parse(line)).toEqual(message);
    }
  });

  it("writes the certificate and the module of the exiting lines of the shared fixture that have them", () => {
    const entries = fixture.valid.filter(
      ({ message }) => message.event === "exiting" && message.module !== null,
    );

    expect(entries.map(({ message }) => message.kind)).toEqual([
      "untrusted_server_certificate",
      "server_certificate_invalid",
      "authentication_failed",
    ]);
    for (const { message } of entries) {
      const line = encodeExitingLine(
        message.kind as Parameters<typeof encodeExitingLine>[0], // the fixture holds valid kinds
        String(message.message),
        { certificate: message.certificate, module: message.module } as ExitDetails, // the schema test holds the shapes
      );
      expect(JSON.parse(line)).toEqual(message);
    }
  });

  it("cuts the message, not the line, when the line would pass 4096 bytes", () => {
    const line = encodeExitingLine("unexpected", `${"é\u0001".repeat(3000)}`);

    expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(BRIDGE_MAX_STATUS_LINE_BYTES);
    expect(BridgeStatusLineSchema.safeParse(JSON.parse(line)).success).toBe(true);
  });

  it("shortens a certificate subject of 5000 bytes and keeps a valid line under the limit", () => {
    const certificate = {
      subject: "CN=é€😀".repeat(1000),
      notBefore: "2026-01-01T00:00:00.000Z",
      notAfter: "2027-01-01T00:00:00.000Z",
      sha256: "a".repeat(64),
      sha1: "b".repeat(40),
      reason: "r\u0001".repeat(2000),
    };

    const started = performance.now();
    const line = encodeExitingLine("untrusted_server_certificate", "refused", {
      certificate,
      module: "plc",
    });

    expect(performance.now() - started).toBeLessThan(500);
    expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(BRIDGE_MAX_STATUS_LINE_BYTES);
    expect(BridgeStatusLineSchema.safeParse(JSON.parse(line)).success).toBe(true);
    expect(JSON.parse(line)).toMatchObject({
      module: "plc",
      certificate: { sha256: "a".repeat(64) },
    });
  });

  it("drops the certificate text, then the certificate, when nothing else fits", () => {
    const huge = "\u0001".repeat(4000);
    const certificate = {
      subject: huge,
      notBefore: "n",
      notAfter: "n",
      sha256: "a".repeat(64),
      sha1: "b".repeat(40),
      reason: huge,
    };

    const line = encodeExitingLine("unexpected", "m".repeat(9000), { certificate, module: null });

    expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(BRIDGE_MAX_STATUS_LINE_BYTES);
    expect(JSON.parse(line).certificate).toMatchObject({ subject: "", reason: "" });
  });

  it("writes the exiting kind of a typed error, and unexpected for any other", async () => {
    const lines: string[] = [];
    const status = createStatusLines(async (line) => {
      lines.push(line);
    });

    await status.exiting(new ConfigurationError("bad"));
    await status.exiting(new BusClosedError("gone"));
    await status.exiting(new Error("boom"));

    expect(lines.map((line) => JSON.parse(line).kind)).toEqual([
      "configuration",
      "bus_closed",
      "unexpected",
    ]);
  });

  it("writes nothing without a writer", async () => {
    const status = createStatusLines(null);

    await status.ready([], CERTIFICATE);
    await status.exiting(new Error("x"));
  });
});
