import { describe, expect, it } from "vitest";
import {
  check,
  factsWith,
  HASH,
  MARKER,
  refusalOf,
  requestWith,
  SECURE,
  transportWith,
  USER,
} from "../test-support/opcua-start-checks.ts";
import { createOpcuaTransport } from "../test-support/opcua-transport.ts";
import { MAX_SUPERVISED_BRIDGES } from "./bridge-checks.ts";
import {
  checkOpcuaStart,
  EXPOSURE_REFUSAL_MESSAGE,
  opcuaArguments,
  opcuaEndpointOf,
} from "./opcua-bridge-start.ts";

describe("the passwords of ADR 0065 point 9", () => {
  const secured = transportWith({ ...SECURE, ...USER });

  it("takes the password of the request for a user module", () => {
    expect(check({ passwords: { plc: MARKER } }, { plc: secured })).toMatchObject({
      ok: true,
      plan: { passwords: { plc: MARKER } },
    });
  });

  it("keeps the stored password when the request omits it, and the request wins when it gives one", () => {
    const stored = { storedPasswords: { plc: "old-password" } };
    expect(check({}, { plc: secured }, stored)).toMatchObject({
      plan: { passwords: { plc: "old-password" } },
    });
    expect(check({ passwords: { plc: MARKER } }, { plc: secured }, stored)).toMatchObject({
      plan: { passwords: { plc: MARKER } },
    });
  });

  it("refuses a user module with no password stored and none given", () => {
    const refusal = refusalOf({}, { plc: secured });
    expect(refusal.code).toBe("invalid_request");
    expect(refusal.message).toContain('"plc"');
    expect(refusal.message).toContain("needs a password");
  });

  it("refuses a password for an anonymous module, and for a module that does not exist", () => {
    const anonymous = refusalOf({ passwords: { plc: MARKER } }, { plc: transportWith(SECURE) });
    expect(anonymous.message).toContain('"plc"');
    expect(anonymous.message).toContain("anonymous");
    const unknown = refusalOf({ passwords: { ghost: MARKER } });
    expect(unknown.message).toContain('"ghost"');
    expect(`${anonymous.message}${unknown.message}`).not.toContain(MARKER);
  });

  it("hands over no password for an anonymous module, even a stored one", () => {
    expect(
      check({}, { plc: transportWith(SECURE) }, { storedPasswords: { plc: "old" } }),
    ).toMatchObject({
      plan: { passwords: {} },
    });
  });
});

describe("the Cloudflare exposure (ADR 0065 point 8)", () => {
  const exposed = { viaExposure: true };

  it.each([
    ["a lan target", { targets: { plc: "192.168.1.10" } }],
    ["a host name", { targets: { plc: "plc.local" } }],
    ["another loopback address", { targets: { plc: "127.0.0.2" } }],
    ["a password", { passwords: { plc: MARKER } }],
    ["a trusted certificate", { trust: [HASH] }],
  ])("answers 403 with the exact message for %s", (_name, fields) => {
    const refusal = refusalOf(
      { ...exposed, ...fields },
      { plc: transportWith({ ...SECURE, ...USER }) },
    );
    expect(refusal.httpStatus).toBe(403);
    expect(refusal.message).toBe(EXPOSURE_REFUSAL_MESSAGE);
    expect(refusal.message).toBe(
      "Through the remote exposure Pantin connects only to a PLC on this host (127.0.0.1 or ::1), without passwords or certificate trust. Open the viewer on the host for these.",
    );
  });

  it("lets a loopback target through, with the password already stored", () => {
    const modules = { plc: transportWith({ ...SECURE, ...USER }) };
    expect(
      check({ ...exposed, targets: { plc: "::1" } }, modules, { storedPasswords: { plc: "old" } }),
    ).toMatchObject({
      ok: true,
      plan: { passwords: { plc: "old" } },
    });
  });
});

describe("the checks every bridge goes through", () => {
  it("refuses an invalid mapping and a missing module with a 409", () => {
    const invalid = factsWith(
      { plc: createOpcuaTransport() },
      { mapping: { status: "invalid", modules: [], problems: ["bad"] } },
    );
    expect(checkOpcuaStart("axis", requestWith({}), invalid)).toMatchObject({
      ok: false,
      refusal: { code: "conflict" },
    });
    expect(refusalOf({ targets: {} }, {}).code).toBe("conflict");
  });

  it("refuses a Pantin whose OPC UA slot is held, and a full core", () => {
    const claim = { pantinId: "axis", kind: "opcua_client" as const, listen: null, ports: [] };
    expect(refusalOf({}, undefined, { activeBridges: [claim] }).code).toBe("conflict");
    const full = Array.from({ length: MAX_SUPERVISED_BRIDGES }, () => ({
      ...claim,
      pantinId: "other",
    }));
    expect(refusalOf({}, undefined, { activeBridges: full }).message).toContain(
      "already supervises",
    );
  });
});

describe("the plan, the endpoint and the arguments", () => {
  it("lowercases the trusted hashes and puts targets and trust on the command line, no password", () => {
    const secured = transportWith({ ...SECURE, ...USER });
    const result = check({ passwords: { plc: MARKER }, trust: [HASH] }, { plc: secured });
    if (!result.ok) {
      throw new Error("Expected a plan.");
    }
    const args = opcuaArguments(result.plan);
    expect(args).toEqual(["--target", "plc=127.0.0.1", "--trust", "a".repeat(64)]);
    expect(args.join(" ")).not.toContain(MARKER);
    expect(JSON.stringify(result.plan.network)).not.toContain(MARKER);
  });

  it("builds opc.tcp://<target>:<port><path>, an IPv6 address in brackets", () => {
    const transport = transportWith({ port: 48400, endpointPath: "/UA" });
    if (transport.kind !== "opcua_client") {
      throw new Error("Expected an OPC UA module.");
    }
    expect(opcuaEndpointOf("192.168.1.10", transport)).toBe("opc.tcp://192.168.1.10:48400/UA");
    expect(opcuaEndpointOf("fd00:0:0:0:0:0:0:1", transport)).toBe(
      "opc.tcp://[fd00:0:0:0:0:0:0:1]:48400/UA",
    );
  });
});
