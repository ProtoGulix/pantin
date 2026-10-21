import { describe, expect, it } from "vitest";
import type { RuleModule } from "../rule-types.ts";
import { TransportConfigSchema } from "../schemas.ts";
import { OPCUA_CLIENT_RULES as rules } from "./rules.ts";
import { BIT_COMMAND, channelOf, created, moduleOf, signals } from "./rules-test-helpers.ts";
import { OPCUA_CLIENT_KIND } from "./schema.ts";

describe("the OPC UA client settings", () => {
  it("default to the values of ADR 0065 point 2, with an empty namespace", () => {
    expect(created()).toEqual({
      kind: "opcua_client",
      port: 4840,
      endpointPath: "",
      securityMode: "SignAndEncrypt",
      securityPolicy: "Basic256Sha256",
      auth: { kind: "anonymous" },
      namespaceUri: "",
      nodeIdPrefix: "|var|CODESYS Control Win V3 x64.Application.",
      gvlName: "GVL_Pantin",
      samplingMilliseconds: 20,
      publishingMilliseconds: 20,
      watchdogMilliseconds: 1000,
    });
  });

  it("are completed by the schema when io.json leaves them out", () => {
    const parsed = TransportConfigSchema.parse({ kind: "opcua_client", namespaceUri: "urn:plc" });
    expect(parsed).toMatchObject({
      port: 4840,
      securityMode: "SignAndEncrypt",
      gvlName: "GVL_Pantin",
    });
  });

  it.each([
    ["a port of 0", { port: 0 }],
    ["an endpoint path with no slash", { endpointPath: "plc" }],
    ["a security policy that is deprecated", { securityPolicy: "Basic256" }],
    ["a GVL name that is not an identifier", { gvlName: "1bad" }],
    ["a sampling above 10 000", { samplingMilliseconds: 10_001 }],
    ["a publishing below 10", { publishingMilliseconds: 9 }],
    ["a watchdog below 100", { watchdogMilliseconds: 99 }],
    ["a user with no name", { auth: { kind: "user", userName: "" } }],
    ["a password in the document", { auth: { kind: "user", userName: "a", password: "x" } }],
    ["a host", { host: "10.0.0.2" }],
  ])("refuse %s", (_name, extra) => {
    expect(TransportConfigSchema.safeParse({ kind: "opcua_client", ...extra }).success).toBe(false);
  });
});

describe("the OPC UA client settings, edited", () => {
  it("keep a patch's absent fields unchanged and write keys in canonical order", () => {
    const edited = rules.patchTransport(created(), {
      kind: OPCUA_CLIENT_KIND,
      auth: { kind: "user", userName: "pantin" },
      port: 4841,
    });
    expect(edited).toMatchObject({ port: 4841, auth: { kind: "user", userName: "pantin" } });
    expect(Object.keys(rules.orderedTransport(edited))).toEqual([
      "kind",
      "port",
      "endpointPath",
      "securityMode",
      "securityPolicy",
      "auth",
      "namespaceUri",
      "nodeIdPrefix",
      "gvlName",
      "samplingMilliseconds",
      "publishingMilliseconds",
      "watchdogMilliseconds",
    ]);
  });

  it("do not listen, and the bridge connects out", () => {
    expect(rules.listenPort(created())).toBeNull();
    expect(rules.network).toBe("connects");
  });
});

describe("the modules of an OPC UA bridge", () => {
  it("are the OPC UA modules only, with no port", () => {
    const modules: RuleModule[] = [
      moduleOf(created()),
      {
        key: "plc2",
        transport: {
          kind: "modbus_tcp_slave",
          port: 1502,
          unitId: 1,
          wordOrder: "low_word_first",
          watchdogMilliseconds: 1000,
        },
        channels: [],
      },
    ];
    expect(rules.bridgeModules(modules)).toEqual([{ key: "plc", port: null }]);
  });
});

describe("the problems of an OPC UA module", () => {
  const problemCodes = (module: RuleModule, known = signals({})) =>
    rules.validateModule(module, known).map((problem) => problem.code);

  it("is none for a module with a namespace and the default security", () => {
    expect(problemCodes(moduleOf(created({ namespaceUri: "urn:plc" })))).toEqual([]);
  });

  it("security_mismatch when only one of the mode and the policy is None", () => {
    const base = { namespaceUri: "urn:plc" };
    expect(problemCodes(moduleOf(created({ ...base, securityMode: "None" })))).toEqual([
      "security_mismatch",
    ]);
    expect(problemCodes(moduleOf(created({ ...base, securityPolicy: "None" })))).toEqual([
      "security_mismatch",
    ]);
    expect(
      problemCodes(moduleOf(created({ ...base, securityMode: "None", securityPolicy: "None" }))),
    ).toEqual([]);
  });

  it("namespace_missing while the namespace URI is empty", () => {
    const found = rules.validateModule(moduleOf(created()), signals({}));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      code: "namespace_missing",
      path: ["transport", "namespaceUri"],
    });
  });
});

describe("the problems of the channels of an OPC UA module", () => {
  it("identifier_invalid for an explicit identifier that is not s= or i=", () => {
    const transport = created({ namespaceUri: "urn:plc" });
    const channels = [
      channelOf("good_s", "s=Some.Node"),
      channelOf("good_i", "i=1234"),
      channelOf("bad_text", "Some.Node"),
      channelOf("bad_number", "i=abc"),
      channelOf("bad_empty_name", "s="),
      channelOf("derived", null),
    ];
    const found = rules
      .validateModule(moduleOf(transport, channels), signals({}))
      .filter((problem) => problem.code === "identifier_invalid");
    expect(found.map((problem) => problem.path)).toEqual([
      ["channels", 2, "opcua", "identifier"],
      ["channels", 3, "opcua", "identifier"],
      ["channels", 4, "opcua", "identifier"],
    ]);
  });

  it("iec_type_mismatch when the IEC type does not fit the signal", () => {
    const transport = created({ namespaceUri: "urn:plc" });
    const channels = [
      channelOf("flag", null, "REAL"),
      channelOf("speed", null, "LREAL"),
      channelOf("count", null, "REAL"),
    ];
    const known = signals({
      flag: BIT_COMMAND,
      speed: { type: "float", direction: "command" },
      count: { type: "integer", direction: "feedback" },
    });
    const found = rules.validateModule(moduleOf(transport, channels), known);
    expect(found.map((problem) => [problem.code, problem.path])).toEqual([
      ["iec_type_mismatch", ["channels", 0, "opcua", "iecType"]],
      ["iec_type_mismatch", ["channels", 2, "opcua", "iecType"]],
    ]);
  });
});
