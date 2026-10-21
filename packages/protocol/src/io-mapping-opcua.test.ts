import { describe, expect, it } from "vitest";
import { IoDocumentSchema } from "./io-document.ts";
import { IoMappingQuerySchema, IoMappingResponseSchema } from "./io-mapping.ts";

// The OPC UA client in the documents and in the answers (ADR 0065). The cases that only the
// TypeScript decoders refuse live here: the Python bridge skips the modules of a transport it
// does not serve, so the shared fixtures cannot hold them.

const TRANSPORT = {
  kind: "opcua_client",
  port: 4840,
  endpointPath: "",
  securityMode: "SignAndEncrypt",
  securityPolicy: "Basic256Sha256",
  auth: { kind: "anonymous" },
  namespaceUri: "urn:plc",
  nodeIdPrefix: "|var|CODESYS Control Win V3 x64.Application.",
  gvlName: "GVL_Pantin",
  samplingMilliseconds: 20,
  publishingMilliseconds: 20,
  watchdogMilliseconds: 1000,
};

const FILE_CHANNEL = {
  tag: "press.valve.extend",
  variable: "extend",
  comment: "",
  opcua: { identifier: null, iecType: "BOOL" },
};

function document(transport: object = TRANSPORT, channel: object = FILE_CHANNEL) {
  return {
    schema_version: 2,
    modules: [{ key: "plc", transport, channels: [channel] }],
  };
}

function answer(opcua: object, transport: object = TRANSPORT) {
  return {
    status: "valid",
    mappingId: "abc",
    modules: [
      {
        key: "plc",
        transport,
        channels: [
          {
            ...FILE_CHANNEL,
            opcua,
            tagType: "bit",
            direction: "command",
            owner: { kind: "drive", id: "valve" },
          },
        ],
      },
    ],
    problems: [],
    unmappedTags: [],
  };
}

const RESOLVED = { identifier: null, iecType: "BOOL", resolvedIdentifier: "s=GVL_Pantin.extend" };

describe("an io.json with an OPC UA module", () => {
  it("is accepted, with the opcua sub-object on every channel", () => {
    expect(IoDocumentSchema.safeParse(document()).success).toBe(true);
  });

  it("refuses a channel that carries the sub-object of another transport", () => {
    const channel = { ...FILE_CHANNEL, modbus: { zone: "coil", address: 0, ioType: "BOOL" } };
    expect(IoDocumentSchema.safeParse(document(TRANSPORT, channel)).success).toBe(false);
  });

  it("refuses a channel with no opcua sub-object", () => {
    const { opcua: _opcua, ...channel } = FILE_CHANNEL;
    expect(IoDocumentSchema.safeParse(document(TRANSPORT, channel)).success).toBe(false);
  });

  it.each([
    ["a password", { ...TRANSPORT, auth: { kind: "user", userName: "a", password: "x" } }],
    ["a host", { ...TRANSPORT, host: "10.0.0.2" }],
    ["a deprecated security policy", { ...TRANSPORT, securityPolicy: "Basic256" }],
  ])("refuses a module with %s", (_name, transport) => {
    expect(IoDocumentSchema.safeParse(document(transport)).success).toBe(false);
  });

  it("refuses an unknown IEC type", () => {
    const channel = { ...FILE_CHANNEL, opcua: { identifier: null, iecType: "STRING" } };
    expect(IoDocumentSchema.safeParse(document(TRANSPORT, channel)).success).toBe(false);
  });
});

describe("the answer for an OPC UA module", () => {
  it("carries the resolved identifier of every channel", () => {
    expect(IoMappingResponseSchema.safeParse(answer(RESOLVED)).success).toBe(true);
  });

  it("refuses a channel without its resolved identifier", () => {
    expect(
      IoMappingResponseSchema.safeParse(answer({ identifier: null, iecType: "BOOL" })).success,
    ).toBe(false);
  });

  it("refuses an unknown IEC type and a password in the settings", () => {
    expect(
      IoMappingResponseSchema.safeParse(answer({ ...RESOLVED, iecType: "STRING" })).success,
    ).toBe(false);
    const withPassword = { ...TRANSPORT, auth: { kind: "user", userName: "a", password: "x" } };
    expect(IoMappingResponseSchema.safeParse(answer(RESOLVED, withPassword)).success).toBe(false);
  });
});

describe("the query of GET .../io", () => {
  it("takes no transport, or a known kind", () => {
    expect(IoMappingQuerySchema.safeParse({}).success).toBe(true);
    expect(IoMappingQuerySchema.safeParse({ transport: "opcua_client" }).success).toBe(true);
  });

  it("refuses an unknown kind and any other parameter", () => {
    expect(IoMappingQuerySchema.safeParse({ transport: "carrier_pigeon" }).success).toBe(false);
    expect(IoMappingQuerySchema.safeParse({ other: "1" }).success).toBe(false);
  });
});
