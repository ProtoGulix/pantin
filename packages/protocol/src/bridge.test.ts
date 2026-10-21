import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  BridgeListResponseSchema,
  SetModbusBridgeRequestSchema,
  SetOpcuaBridgeRequestSchema,
} from "./bridge.ts";
import { BRIDGE_EXIT_KINDS, BridgeStatusLineSchema } from "./bridge-status-lines.ts";

// The fixture is shared with the Python bridge (ADR 0050 point 2): an entry
// holds either the decoded line (`message`) or a line that is not JSON (`text`).
const CaseSchema = z.object({
  name: z.string(),
  message: z.unknown().optional(),
  text: z.string().optional(),
});
const FixtureFileSchema = z.object({
  version: z.literal(2),
  maxLineBytes: z.number().int(),
  exitKinds: z.array(z.string()),
  valid: z.array(CaseSchema),
  invalid: z.array(CaseSchema),
});

const fixtures = FixtureFileSchema.parse(
  JSON.parse(
    readFileSync(new URL("../fixtures/bridge-status-lines.json", import.meta.url), "utf8"),
  ) as unknown,
);

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

describe("bridge status line fixtures", () => {
  it("lists the same exit kinds as the schema", () => {
    expect(fixtures.exitKinds).toEqual([...BRIDGE_EXIT_KINDS]);
  });

  it.each(fixtures.valid.map((entry) => [entry.name, entry.message] as const))(
    "accepts: %s",
    (_name, message) => {
      expect(BridgeStatusLineSchema.safeParse(message).success).toBe(true);
    },
  );

  it.each(fixtures.invalid.map((entry) => [entry.name, entry] as const))(
    "refuses: %s",
    (_name, entry) => {
      if (entry.text !== undefined) {
        expect(isJson(entry.text)).toBe(false);
      } else {
        expect(BridgeStatusLineSchema.safeParse(entry.message).success).toBe(false);
      }
    },
  );
});

describe("SetModbusBridgeRequestSchema", () => {
  it("reads a start request, with an empty allow list by default", () => {
    expect(SetModbusBridgeRequestSchema.parse({ running: true, listen: "127.0.0.1" })).toEqual({
      running: true,
      listen: "127.0.0.1",
      allow: [],
    });
  });

  it("reads a stop request", () => {
    expect(SetModbusBridgeRequestSchema.parse({ running: false })).toEqual({ running: false });
  });

  it.each([
    ["an unknown field on start", { running: true, listen: "127.0.0.1", python: "x" }],
    ["a listen field on stop", { running: false, listen: "127.0.0.1" }],
    ["a start without listen", { running: true }],
    [
      "more than 16 allow entries",
      { running: true, listen: "10.0.0.1", allow: Array(17).fill("1.1.1.1") },
    ],
    ["no running field", { listen: "127.0.0.1" }],
  ])("refuses %s", (_name, body) => {
    expect(SetModbusBridgeRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe("SetOpcuaBridgeRequestSchema", () => {
  it("reads a stop request and refuses extra fields on it", () => {
    expect(SetOpcuaBridgeRequestSchema.parse({ running: false })).toEqual({ running: false });
    expect(SetOpcuaBridgeRequestSchema.safeParse({ running: false, targets: {} }).success).toBe(
      false,
    );
  });

  it("reads a start request with targets, and optional passwords and trust", () => {
    const hash = "ab".repeat(32);
    expect(
      SetOpcuaBridgeRequestSchema.parse({ running: true, targets: { plc: "127.0.0.1" } }),
    ).toEqual({
      running: true,
      targets: { plc: "127.0.0.1" },
    });
    const full = {
      running: true,
      targets: { plc: "127.0.0.1" },
      passwords: { plc: "x" },
      trust: [hash],
    };
    expect(SetOpcuaBridgeRequestSchema.parse(full)).toEqual(full);
  });

  it.each([
    ["no targets", { running: true }],
    ["an unknown field", { running: true, targets: {}, listen: "127.0.0.1" }],
    ["an empty target", { running: true, targets: { plc: "" } }],
    ["an empty password", { running: true, targets: {}, passwords: { plc: "" } }],
    [
      "a password over 256 characters",
      { running: true, targets: {}, passwords: { plc: "x".repeat(257) } },
    ],
    ["a hash that is not SHA-256 hex", { running: true, targets: {}, trust: ["abc"] }],
    ["a thumbprint in SHA-1", { running: true, targets: {}, trust: ["ab".repeat(20)] }],
    [
      "too many certificates",
      { running: true, targets: {}, trust: Array.from({ length: 17 }, () => "ab".repeat(32)) },
    ],
    [
      "too many targets",
      {
        running: true,
        targets: Object.fromEntries(
          Array.from({ length: 33 }, (_, index) => [`m${index}`, "127.0.0.1"]),
        ),
      },
    ],
    ["a module key that is not a key", { running: true, targets: { "Not A Key": "127.0.0.1" } }],
  ])("refuses %s", (_name, body) => {
    expect(SetOpcuaBridgeRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe("BridgeListResponseSchema", () => {
  const common = {
    availability: "available",
    state: "running",
    failure: null,
    log: [],
    externalBridgeConnected: false,
  };
  const modbus = {
    ...common,
    transport: "modbus_tcp_slave",
    network: { listen: "127.0.0.1", allow: [] },
    modules: [{ key: "m1", endpoint: "127.0.0.1:1502", plcConnected: true, reason: null }],
    listenChoices: ["127.0.0.1"],
  };
  const opcua = {
    ...common,
    transport: "opcua_client",
    network: { targets: { plc: "127.0.0.1" } },
    clientCertificate: null,
    modules: [
      {
        key: "plc",
        endpoint: "opc.tcp://127.0.0.1:4840",
        plcConnected: false,
        reason: "certificate_rejected",
      },
    ],
  };

  it("reads one status per kind, each with its own network", () => {
    expect(BridgeListResponseSchema.safeParse({ bridges: [modbus, opcua] }).success).toBe(true);
  });

  it("reads a kind that never started", () => {
    const idle = { ...opcua, state: "stopped", network: null, modules: [] };
    expect(BridgeListResponseSchema.safeParse({ bridges: [idle] }).success).toBe(true);
  });

  it("reads the client certificate of an OPC UA status, and requires the field", () => {
    const certificate = { subject: "CN=Pantin", applicationUri: "urn:x", sha256: "a", sha1: "b" };
    expect(
      BridgeListResponseSchema.safeParse({
        bridges: [{ ...opcua, clientCertificate: certificate }],
      }).success,
    ).toBe(true);
    const { clientCertificate: _omitted, ...without } = opcua;
    expect(BridgeListResponseSchema.safeParse({ bridges: [without] }).success).toBe(false);
  });

  it.each([
    [
      "listen settings on an OPC UA status",
      { ...opcua, network: { listen: "127.0.0.1", allow: [] } },
    ],
    ["targets on a Modbus status", { ...modbus, network: { targets: {} } }],
    [
      "a module without endpoint",
      { ...modbus, modules: [{ key: "m1", plcConnected: true, reason: null }] },
    ],
    ["no transport", { ...modbus, transport: undefined }],
  ])("refuses %s", (_name, status) => {
    expect(BridgeListResponseSchema.safeParse({ bridges: [status] }).success).toBe(false);
  });
});
