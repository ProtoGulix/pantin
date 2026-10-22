import {
  ApplyIoVariablesResponseSchema,
  IO_VARIABLES_MAX_ENTRIES,
  SYMBOL_FILE_MAX_BYTES,
  type SymbolImportPreview,
  SymbolImportPreviewSchema,
} from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { COIL, channelOf, OTHER_COIL, SETPOINT_TAG, useIoAxis } from "../test-support/io-edits.ts";
import { AXIS_SYMBOL_FILE, xmlBody } from "../test-support/symbol-files.ts";
import { type RawResponse, sendJsonRequest, sendRaw } from "../test-support/test-server.ts";

// POST .../io/symbols/preview and POST .../io/variables (ADR 0064 point 13).

const io = useIoAxis();
const PREVIEW = "/api/pantins/axis/io/symbols/preview";
const VARIABLES = "/api/pantins/axis/io/variables";

async function mapThreeTags(): Promise<void> {
  await io.addModule();
  await io.mapTags([COIL, OTHER_COIL, SETPOINT_TAG]);
}

function previewOf(response: RawResponse): SymbolImportPreview {
  expect(response.status).toBe(200);
  return SymbolImportPreviewSchema.parse(response.json);
}

describe("POST .../io/symbols/preview", () => {
  it("matches the variables of the file to the mapped signals and changes nothing", async () => {
    await mapThreeTags();
    const before = (await io.call("GET", "")).answer.mappingId;
    const preview = previewOf(
      await sendRaw(io.axis().server, "POST", PREVIEW, xmlBody(AXIS_SYMBOL_FILE)),
    );
    expect(preview).toMatchObject({
      format: "codesys-symbolconfiguration",
      project: { name: "Axis", deviceName: "Device", applicationName: "Application" },
      symbolCount: 4,
    });
    expect(preview.proposals).toEqual([
      expect.objectContaining({
        tag: OTHER_COIL,
        currentVariable: "carriage_valve_coil_12",
        proposedVariable: "PLC_PRG.CarriageValveCoil12",
        rule: "normalised",
        compatibility: "compatible",
      }),
    ]);
    expect(preview.unchanged.map((match) => [match.tag, match.compatibility])).toEqual([
      [COIL, "compatible"],
      [SETPOINT_TAG, "incompatible"],
    ]);
    expect(preview.unusedSymbols.map((entry) => [entry.symbol.reference, entry.reason])).toEqual([
      ["PLC_PRG.rStroke", "no_signal"],
    ]);
    expect((await io.call("GET", "")).answer.mappingId).toBe(before);
  });

  it("takes the format from the query when it is given, text/xml included", async () => {
    await mapThreeTags();
    const body = { ...xmlBody(AXIS_SYMBOL_FILE), contentType: "text/xml; charset=utf-8" };
    const response = await sendRaw(
      io.axis().server,
      "POST",
      `${PREVIEW}?format=codesys-symbolconfiguration`,
      body,
    );
    expect(previewOf(response).symbolCount).toBe(4);
  });

  it("answers 400 with the known formats for a format it does not know", async () => {
    await mapThreeTags();
    const response = await sendRaw(
      io.axis().server,
      "POST",
      `${PREVIEW}?format=tia`,
      xmlBody(AXIS_SYMBOL_FILE),
    );
    expect(response.status).toBe(400);
    expect(response.body).toContain("codesys-symbolconfiguration");
  });

  it("answers 400 for a file no format recognises, and for a refused DOCTYPE", async () => {
    await mapThreeTags();
    const unknown = await sendRaw(io.axis().server, "POST", PREVIEW, xmlBody("<other/>"));
    expect(unknown.status).toBe(400);
    expect(unknown.body).toContain("codesys-symbolconfiguration");
    const doctype = AXIS_SYMBOL_FILE.replace("<Header>", "<!DOCTYPE x><Header>");
    const refused = await sendRaw(
      io.axis().server,
      "POST",
      `${PREVIEW}?format=codesys-symbolconfiguration`,
      xmlBody(doctype),
    );
    expect(refused.status).toBe(400);
    expect(refused.body).toContain("DOCTYPE");
  });

  it("answers 415 for a JSON body and 400 for bytes that are not UTF-8", async () => {
    await mapThreeTags();
    const json = await sendJsonRequest(io.axis().server, "POST", PREVIEW, {});
    expect(json.status).toBe(415);
    const latin1 = { contentType: "application/xml", bytes: Uint8Array.of(0x3c, 0xe9, 0x3e) };
    const bytes = await sendRaw(io.axis().server, "POST", PREVIEW, latin1);
    expect(bytes.status).toBe(400);
    expect(bytes.body).toContain("UTF-8");
  });

  it("reads a file up to 8 MiB and answers 413 above it, while JSON stays at 64 KiB", async () => {
    await mapThreeTags();
    const padding = (bytes: number) => `<!-- ${"x".repeat(bytes)} -->`;
    const fits = AXIS_SYMBOL_FILE.replace(
      "<Header>",
      `${padding(SYMBOL_FILE_MAX_BYTES - 2000)}<Header>`,
    );
    expect(fits.length).toBeLessThanOrEqual(SYMBOL_FILE_MAX_BYTES);
    expect(
      previewOf(await sendRaw(io.axis().server, "POST", PREVIEW, xmlBody(fits))).symbolCount,
    ).toBe(4);
    const tooBig = xmlBody(padding(SYMBOL_FILE_MAX_BYTES));
    expect((await sendRaw(io.axis().server, "POST", PREVIEW, tooBig)).status).toBe(413);
    const oversizeJson = await sendJsonRequest(
      io.axis().server,
      "POST",
      "/api/pantins/axis/io/modules",
      {
        padding: "x".repeat(70_000),
      },
    );
    expect(oversizeJson.status).toBe(413);
  });

  it("answers 404 while the Pantin has no mapping to match against", async () => {
    const response = await sendRaw(io.axis().server, "POST", PREVIEW, xmlBody(AXIS_SYMBOL_FILE));
    expect(response.status).toBe(404);
  });
});

describe("POST .../io/variables", () => {
  const assignment = (variable: string, tag = OTHER_COIL) => ({ module: "m1", tag, variable });

  it("sets the variables, answers the whole mapping and leaves it unsaved", async () => {
    await mapThreeTags();
    const response = await sendJsonRequest(io.axis().server, "POST", VARIABLES, {
      assignments: [assignment("PLC_PRG.CarriageValveCoil12")],
    });
    expect(response.status).toBe(200);
    const answer = ApplyIoVariablesResponseSchema.parse(response.json);
    expect(answer.applied).toEqual([assignment("PLC_PRG.CarriageValveCoil12")]);
    expect(answer.skipped).toEqual([]);
    expect(answer.status).toBe("valid");
    const channel = answer.modules[0]?.channels.find((candidate) => candidate.tag === OTHER_COIL);
    expect(channel?.variable).toBe("PLC_PRG.CarriageValveCoil12");
    expect(channelOf(await io.call("GET", ""), OTHER_COIL)?.variable).toBe(
      "PLC_PRG.CarriageValveCoil12",
    );
  });

  it("applies what it can and reports each entry it skips with a reason", async () => {
    await mapThreeTags();
    const response = await sendJsonRequest(io.axis().server, "POST", VARIABLES, {
      assignments: [
        assignment("GVL.fine"),
        assignment("TYPE", COIL),
        { module: "m9", tag: COIL, variable: "x" },
        assignment("someone", "carriage.stroke.position"),
      ],
    });
    const answer = ApplyIoVariablesResponseSchema.parse(response.json);
    expect(answer.applied.map((entry) => entry.variable)).toEqual(["GVL.fine"]);
    expect(answer.skipped.map((entry) => entry.variable)).toEqual(["TYPE", "x", "someone"]);
    expect(answer.skipped.every((entry) => entry.reason.message.length > 0)).toBe(true);
  });

  it("refuses more than 4000 entries and a body over 1 MiB", async () => {
    await mapThreeTags();
    const many = Array(IO_VARIABLES_MAX_ENTRIES + 1).fill(assignment("x"));
    const tooMany = await sendJsonRequest(io.axis().server, "POST", VARIABLES, {
      assignments: many,
    });
    expect(tooMany.status).toBe(400);
    const padding = { assignments: [assignment("x")], padding: "x".repeat(1024 * 1024) };
    const tooBig = await sendJsonRequest(io.axis().server, "POST", VARIABLES, padding);
    expect(tooBig.status).toBe(413);
  });

  it("accepts a batch of 4000 entries, which the 64 KiB limit of other edits would refuse", async () => {
    await mapThreeTags();
    const batch = Array(IO_VARIABLES_MAX_ENTRIES).fill(assignment("GVL.same"));
    const response = await sendJsonRequest(io.axis().server, "POST", VARIABLES, {
      assignments: batch,
    });
    expect(response.status).toBe(200);
    // One channel asked 4000 times: the first entry counts, the others are skipped.
    const answer = ApplyIoVariablesResponseSchema.parse(response.json);
    expect(answer.applied).toHaveLength(1);
    expect(answer.skipped).toHaveLength(IO_VARIABLES_MAX_ENTRIES - 1);
  });

  it("answers 404 while the Pantin has no mapping", async () => {
    const response = await sendJsonRequest(io.axis().server, "POST", VARIABLES, {
      assignments: [assignment("GVL.x")],
    });
    expect(response.status).toBe(404);
  });
});

describe("POST .../io/symbols/preview module proposals (ADR 0065 point 12)", () => {
  const OPCUA_MODULE = { transport: { kind: "opcua_client", namespaceUri: "urn:test" } };
  const SUGGESTED = "|var|Device.Application.";

  it("proposes the prefix of the file for an OPC UA module, then nothing once it is applied", async () => {
    await io.addModule();
    await io.call("POST", "/modules", OPCUA_MODULE);
    const before = (await io.call("GET", "")).answer.mappingId;
    const response = await sendRaw(io.axis().server, "POST", PREVIEW, xmlBody(AXIS_SYMBOL_FILE));
    expect(previewOf(response).moduleProposals).toEqual([
      { module: "m2", nodeIdPrefix: SUGGESTED, reason: "from_project_info" },
    ]);
    expect((await io.call("GET", "")).answer.mappingId).toBe(before);

    const patch = { transport: { kind: "opcua_client", nodeIdPrefix: SUGGESTED } };
    expect((await io.call("PATCH", "/modules/m2", patch)).status).toBe(200);
    const again = await sendRaw(io.axis().server, "POST", PREVIEW, xmlBody(AXIS_SYMBOL_FILE));
    expect(previewOf(again).moduleProposals).toEqual([]);
  });

  it("proposes nothing for a Modbus module", async () => {
    await mapThreeTags();
    const response = await sendRaw(io.axis().server, "POST", PREVIEW, xmlBody(AXIS_SYMBOL_FILE));
    expect(previewOf(response).moduleProposals).toEqual([]);
  });
});
