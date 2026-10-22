import { describe, expect, it } from "vitest";
import { ConfigurationError, MappingNotValidError, ProtocolError } from "./errors.ts";
import { endpointOf, planModules } from "./module-plan.ts";
import { opcuaProjection } from "./test-support/projection-fixtures.ts";

const TARGETS = new Map([["plc", "192.168.1.10"]]);
const NO_PASSWORDS = new Map<string, string>();

function plan(
  projection = opcuaProjection(),
  options: {
    targets?: Map<string, string>;
    passwords?: Map<string, string>;
    startedByCore?: boolean;
  } = {},
) {
  return planModules({
    projection,
    targets: options.targets ?? TARGETS,
    passwords: options.passwords ?? NO_PASSWORDS,
    startedByCore: options.startedByCore ?? true,
  });
}

describe("planModules", () => {
  it("plans a module with its endpoint, nodes and anonymous login", () => {
    const { mappingId, modules } = plan();

    expect(mappingId).toMatch(/^[0-9a-f]{64}$/);
    expect(modules).toHaveLength(1);
    expect(modules[0]).toMatchObject({
      key: "plc",
      target: "192.168.1.10",
      endpoint: "opc.tcp://192.168.1.10:4840",
      login: { kind: "anonymous" },
      signals: [
        { tag: "press.valve.extend", direction: "command", iecType: "BOOL" },
        { tag: "press.cylinder.extended", direction: "feedback", iecType: "BOOL" },
      ],
    });
    expect(modules[0]?.signals[0]?.identifier).toBe("s=|var|App.GVL_Pantin.plc_extend");
  });

  it("builds the endpoint with its path, and brackets around an IPv6 address", () => {
    const transport = opcuaProjection([{ key: "plc", endpointPath: "/ua" }]).modules[0]?.transport;
    if (transport?.kind !== "opcua_client") {
      throw new Error("fixture");
    }

    expect(endpointOf(transport, "192.168.1.10")).toBe("opc.tcp://192.168.1.10:4840/ua");
    expect(endpointOf(transport, "0:0:0:0:0:0:0:1")).toBe("opc.tcp://[0:0:0:0:0:0:0:1]:4840/ua");
  });

  it("gives a user module its password", () => {
    const projection = opcuaProjection([{ key: "plc", userName: "operator" }]);

    const { modules } = plan(projection, { passwords: new Map([["plc", "s3cret"]]) });

    expect(modules[0]?.login).toEqual({ kind: "user", userName: "operator", password: "s3cret" });
  });

  it("tells a terminal run to start from the viewer when a user module needs a password", () => {
    const projection = opcuaProjection([{ key: "plc", userName: "operator" }]);

    expect(() => plan(projection, { startedByCore: false })).toThrow(/Start it from the viewer/);
  });

  it("asks a core start to type the password again when it gave none", () => {
    const projection = opcuaProjection([{ key: "plc", userName: "operator" }]);

    expect(() => plan(projection)).toThrow(/gave no password/);
  });

  it("refuses a user login with security None toward a network address, as the core does", () => {
    const projection = opcuaProjection([
      { key: "plc", userName: "operator", securityMode: "None", securityPolicy: "None" },
    ]);
    const passwords = new Map([["plc", "s3cret"]]);

    expect(() => plan(projection, { passwords })).toThrow(ConfigurationError);
    expect(() => plan(projection, { passwords })).toThrow(/would travel in clear/);
    expect(() =>
      plan(projection, { passwords, targets: new Map([["plc", "127.0.0.1"]]) }),
    ).not.toThrow();
  });

  it("accepts security None with an anonymous login toward a network address", () => {
    const projection = opcuaProjection([
      { key: "plc", securityMode: "None", securityPolicy: "None" },
    ]);

    expect(() => plan(projection)).not.toThrow();
  });

  it("refuses a projection that is not valid, with its problems", () => {
    const projection = opcuaProjection(undefined, {
      status: "invalid",
      mappingId: null,
      problems: [
        {
          code: "namespace_missing",
          path: ["modules", 0, "transport", "namespaceUri"],
          message: "Fill the namespace.",
        },
      ],
    });

    expect(() => plan(projection)).toThrow(MappingNotValidError);
    expect(() => plan(projection)).toThrow(
      /modules\[0\]\.transport\.namespaceUri: Fill the namespace\./,
    );
  });

  it("refuses a Pantin with no OPC UA module", () => {
    expect(() => plan(opcuaProjection([]))).toThrow(/nothing to bridge/);
  });

  it("requires exactly one target per module", () => {
    expect(() => plan(opcuaProjection(), { targets: new Map() })).toThrow(
      /No --target for module plc/,
    );
    expect(() =>
      plan(opcuaProjection(), {
        targets: new Map([
          ["plc", "127.0.0.1"],
          ["extra", "127.0.0.1"],
        ]),
      }),
    ).toThrow(ConfigurationError);
    expect(() =>
      plan(opcuaProjection(), {
        targets: new Map([
          ["plc", "127.0.0.1"],
          ["extra", "127.0.0.1"],
        ]),
      }),
    ).toThrow(/extra/);
  });

  it("refuses a channel the core did not resolve", () => {
    const projection = opcuaProjection();
    const channel = projection.modules[0]?.channels[0];
    if (channel === undefined) {
      throw new Error("fixture");
    }
    delete channel.opcua;

    expect(() => plan(projection)).toThrow(ProtocolError);
  });
});
