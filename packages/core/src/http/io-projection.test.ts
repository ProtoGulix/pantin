import { createHash } from "node:crypto";
import { IO_SCHEMA_VERSION, type IoDocument } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { serializeIoDocument } from "../domain/io-document-text.ts";
import {
  COIL,
  channelOf,
  type IoCall,
  OTHER_COIL,
  POSITION_TAG,
  useIoAxis,
} from "../test-support/io-edits.ts";

// GET .../io?transport=<kind> (ADR 0065 point 7): the projection of the mapping on one
// transport. What another kind's modules do must never reach it.

const io = useIoAxis();

const MODBUS = "?transport=modbus_tcp_slave";
const OPCUA = "?transport=opcua_client";

async function addOpcuaModule(settings: Record<string, unknown> = {}): Promise<IoCall> {
  return io.call("POST", "/modules", { transport: { kind: "opcua_client", ...settings } });
}

// m1 is a Modbus module with one coil, m2 an OPC UA module that is missing its namespace.
async function modbusThenOpcua(): Promise<void> {
  await io.addModule();
  await io.mapTags([COIL], "m1");
  await addOpcuaModule();
  await io.mapTags([OTHER_COIL, POSITION_TAG], "m2");
}

describe("GET .../io?transport=<kind>", () => {
  it("keeps the modules of that kind and the problems of those modules, with their own paths", async () => {
    await modbusThenOpcua();
    const modbus = await io.call("GET", MODBUS);
    expect(modbus.answer.modules.map((module) => module.key)).toEqual(["m1"]);
    expect(modbus.answer.status).toBe("valid");
    expect(modbus.answer.problems).toEqual([]);

    const opcua = await io.call("GET", OPCUA);
    expect(opcua.answer.modules.map((module) => module.key)).toEqual(["m2"]);
    expect(opcua.answer.status).toBe("invalid");
    expect(opcua.answer.problems.map((problem) => [problem.code, problem.path])).toEqual([
      ["namespace_missing", ["modules", 0, "transport", "namespaceUri"]],
    ]);
  });

  it("leaves the unfiltered answer as the whole file, problems of every kind included", async () => {
    await modbusThenOpcua();
    const whole = await io.call("GET", "");
    expect(whole.answer.modules.map((module) => module.key)).toEqual(["m1", "m2"]);
    expect(whole.answer.status).toBe("invalid");
    expect(whole.answer.problems.map((problem) => problem.path)).toEqual([
      ["modules", 1, "transport", "namespaceUri"],
    ]);
  });

  it("answers 400 for a transport nobody registered or another parameter", async () => {
    await io.addModule();
    expect((await io.call("GET", "?transport=carrier_pigeon")).status).toBe(400);
    expect((await io.call("GET", "?other=1")).status).toBe(400);
  });

  it("answers an empty valid projection for a kind with no module", async () => {
    await io.addModule();
    const opcua = await io.call("GET", OPCUA);
    expect(opcua.answer).toMatchObject({ status: "valid", modules: [], problems: [] });
    expect(opcua.answer.mappingId).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is the missing answer for a Pantin with no io.json", async () => {
    const opcua = await io.call("GET", OPCUA);
    expect(opcua.answer).toMatchObject({ status: "missing", mappingId: null, modules: [] });
  });
});

describe("the id and the status of a projection", () => {
  it("do not move when an invalid OPC UA module is added, mapped or edited", async () => {
    await io.addModule();
    await io.mapTags([COIL], "m1");
    const before = (await io.call("GET", MODBUS)).answer;

    await addOpcuaModule();
    await io.mapTags([OTHER_COIL], "m2");
    await io.call("PATCH", "/modules/m2", {
      transport: { kind: "opcua_client", gvlName: "GVL_B" },
    });
    await io.call("PATCH", "/modules/m2", {
      transport: { kind: "opcua_client", securityMode: "None" },
    });
    const after = (await io.call("GET", MODBUS)).answer;

    expect((await io.call("GET", "")).answer.status).toBe("invalid");
    expect(after.status).toBe("valid");
    expect(after.mappingId).toBe(before.mappingId);
    expect(after.problems).toEqual(before.problems);
  });
});

describe("the id of a projection when its own modules change", () => {
  it("move for an edit of a module of that kind, and only for those", async () => {
    await modbusThenOpcua();
    const modbusBefore = (await io.call("GET", MODBUS)).answer.mappingId;
    const opcuaBefore = (await io.call("GET", OPCUA)).answer.mappingId;

    await io.call("PATCH", "/modules/m1", { transport: { kind: "modbus_tcp_slave", unitId: 9 } });

    expect((await io.call("GET", MODBUS)).answer.mappingId).not.toBe(modbusBefore);
    expect((await io.call("GET", OPCUA)).answer.mappingId).toBe(opcuaBefore);
  });

  it("move when the projection turns from invalid to valid", async () => {
    await modbusThenOpcua();
    const invalid = (await io.call("GET", OPCUA)).answer;
    await io.call("PATCH", "/modules/m2", {
      transport: { kind: "opcua_client", namespaceUri: "urn:plc" },
    });
    const valid = (await io.call("GET", OPCUA)).answer;
    expect([invalid.status, valid.status]).toEqual(["invalid", "valid"]);
    expect(valid.mappingId).not.toBe(invalid.mappingId);
  });

  it("keep the id of the unfiltered route as the SHA-256 of the canonical file", async () => {
    await io.addModule();
    await io.mapTags([COIL], "m1");
    const whole = (await io.call("GET", "")).answer;
    const file: IoDocument = {
      schema_version: IO_SCHEMA_VERSION,
      modules: whole.modules.map((module) => ({
        key: module.key,
        transport: module.transport,
        channels: module.channels.map(({ tag, variable, comment, modbus }) => ({
          tag,
          variable,
          comment,
          ...(modbus === undefined ? {} : { modbus }),
        })),
      })),
    };
    const expected = createHash("sha256").update(serializeIoDocument(file)).digest("hex");
    expect(whole.mappingId).toBe(expected);
    expect((await io.call("GET", MODBUS)).answer.mappingId).not.toBe(expected);
  });
});

describe("the resolved identifier of an OPC UA channel", () => {
  it("is derived from the prefix, the GVL name and an undotted variable", async () => {
    await addOpcuaModule({ namespaceUri: "urn:plc", gvlName: "GVL_Sim" });
    const call = await io.mapTags([COIL], "m1");
    const channel = channelOf(call, COIL);
    expect(channel?.opcua).toMatchObject({
      identifier: null,
      iecType: "BOOL",
      resolvedIdentifier: expect.stringMatching(
        /^s=\|var\|CODESYS Control Win V3 x64\.Application\.GVL_Sim\.carriage_valve_coil_14$/,
      ),
    });
  });

  it("is the dotted variable under the prefix alone, and the explicit identifier as it is", async () => {
    await addOpcuaModule({ namespaceUri: "urn:plc" });
    await io.mapTags([COIL, OTHER_COIL], "m1");
    await io.call("PATCH", `/modules/m1/channels/${COIL}`, { variable: "GVL_IO.Valve.Extend" });
    const call = await io.call("PATCH", `/modules/m1/channels/${OTHER_COIL}`, {
      opcua: { identifier: "i=77" },
    });
    expect(channelOf(call, COIL)?.opcua?.resolvedIdentifier).toBe(
      "s=|var|CODESYS Control Win V3 x64.Application.GVL_IO.Valve.Extend",
    );
    expect(channelOf(call, OTHER_COIL)?.opcua).toMatchObject({
      identifier: "i=77",
      resolvedIdentifier: "i=77",
    });
  });

  it("goes back to derived when the identifier is edited to null", async () => {
    await addOpcuaModule({ namespaceUri: "urn:plc" });
    await io.mapTags([COIL], "m1");
    await io.call("PATCH", `/modules/m1/channels/${COIL}`, { opcua: { identifier: "i=77" } });
    const call = await io.call("PATCH", `/modules/m1/channels/${COIL}`, {
      opcua: { identifier: null },
    });
    expect(channelOf(call, COIL)?.opcua?.identifier).toBeNull();
  });

  it("is absent from a Modbus channel", async () => {
    await io.addModule();
    const call = await io.mapTags([COIL], "m1");
    expect(channelOf(call, COIL)?.opcua).toBeUndefined();
  });
});

describe("the problems of an OPC UA module", () => {
  it("are namespace_missing until the namespace is filled in", async () => {
    const created = await addOpcuaModule();
    expect(created.answer.problems.map((problem) => problem.code)).toEqual(["namespace_missing"]);
    const fixed = await io.call("PATCH", "/modules/m1", {
      transport: { kind: "opcua_client", namespaceUri: "urn:plc" },
    });
    expect(fixed.answer.status).toBe("valid");
  });

  it("are security_mismatch when only the mode or the policy is None", async () => {
    await addOpcuaModule({ namespaceUri: "urn:plc" });
    const call = await io.call("PATCH", "/modules/m1", {
      transport: { kind: "opcua_client", securityMode: "None" },
    });
    expect(call.answer.problems.map((problem) => problem.code)).toEqual(["security_mismatch"]);
  });

  it("are identifier_invalid and iec_type_mismatch on the channel's own paths", async () => {
    await addOpcuaModule({ namespaceUri: "urn:plc" });
    await io.mapTags([COIL], "m1");
    const call = await io.call("PATCH", `/modules/m1/channels/${COIL}`, {
      opcua: { identifier: "nope", iecType: "REAL" },
    });
    expect(call.answer.problems.map((problem) => [problem.code, problem.path])).toEqual([
      ["identifier_invalid", ["modules", 0, "channels", 0, "opcua", "identifier"]],
      ["iec_type_mismatch", ["modules", 0, "channels", 0, "opcua", "iecType"]],
    ]);
  });

  it("are gvl_name_mismatch for one undotted variable in two GVLs, and gone once they agree", async () => {
    await addOpcuaModule({ namespaceUri: "urn:a", gvlName: "GVL_A" });
    await addOpcuaModule({ namespaceUri: "urn:b", gvlName: "GVL_B" });
    await io.mapTags([POSITION_TAG], "m1");
    const mapped = await io.mapTags([POSITION_TAG], "m2");
    expect(mapped.answer.problems.map((problem) => [problem.code, problem.path])).toEqual([
      ["gvl_name_mismatch", ["modules", 1, "transport", "gvlName"]],
    ]);
    const second = await io.call("GET", `${OPCUA}`);
    expect(second.answer.problems.map((problem) => problem.code)).toEqual(["gvl_name_mismatch"]);

    const fixed = await io.call("PATCH", "/modules/m2", {
      transport: { kind: "opcua_client", gvlName: "GVL_A" },
    });
    expect(fixed.answer.status).toBe("valid");
  });
});
