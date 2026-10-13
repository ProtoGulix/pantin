import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { IO_FILE_MAX_BYTES, IoMappingResponseSchema, type Tag } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type BusAxis, startBusAxis } from "../test-support/bus-axis.ts";
import { listTags } from "../test-support/bus-rest.ts";
import { csvText, MODULES_JSON, writeIoFiles } from "../test-support/io-files.ts";
import { SENTINEL_CONTENT, sendJsonRequest, sendRaw } from "../test-support/test-server.ts";

// GET /api/pantins/:pantinId/io (ADR 0045 point 7).

let axis: BusAxis;
let tags: Tag[];

beforeEach(async () => {
  axis = await startBusAxis();
  tags = await listTags(axis);
});

afterEach(async () => {
  await axis.close();
});

async function readIo(pantinId = "axis") {
  const response = await sendRaw(axis.server, "GET", `/api/pantins/${pantinId}/io`);
  return { status: response.status, answer: IoMappingResponseSchema.parse(response.json) };
}

const onM1 = (names: readonly string[]) =>
  tags.filter((tag) => names.includes(tag.name)).map((tag) => ({ tag, module: "m1" }));
const ALL = () => tags.map((tag) => ({ tag, module: "m1" }));

describe("GET .../io missing and valid", () => {
  it("is missing, with every tag unmapped, when there is no io.csv", async () => {
    const { status, answer } = await readIo();
    expect(status).toBe(200);
    expect(answer).toEqual({
      status: "missing",
      mappingId: null,
      modules: [],
      rows: [],
      problems: [],
      unmappedTags: tags.map((tag) => tag.name),
    });
  });

  it("stays missing when only io-modules.json exists", async () => {
    await writeIoFiles(axis, { modules: MODULES_JSON });
    expect((await readIo()).answer.status).toBe("missing");
  });

  it("is valid for a consistent mapping, with each tag's type and direction and the module defaults", async () => {
    await writeIoFiles(axis, { csv: csvText(ALL()), modules: MODULES_JSON });
    const { answer } = await readIo();
    expect(answer.status).toBe("valid");
    expect(answer.problems).toEqual([]);
    expect(answer.unmappedTags).toEqual([]);
    expect(answer.mappingId).toMatch(/^[0-9a-f]{64}$/);
    expect(answer.modules[0]).toEqual({
      key: "m1",
      port: 1502,
      unitId: 1,
      wordOrder: "low_word_first",
      watchdogMilliseconds: 1000,
    });
    expect(answer.rows.map((row) => [row.tag, row.type, row.direction])).toEqual(
      tags.map((tag) => [tag.name, tag.type, tag.direction]),
    );
  });

  it("lists as unmapped, and still valid, a tag that no row maps", async () => {
    const [first, ...others] = tags;
    await writeIoFiles(axis, {
      csv: csvText(onM1(first ? [first.name] : [])),
      modules: MODULES_JSON,
    });
    const { answer } = await readIo();
    expect(answer.status).toBe("valid");
    expect(answer.unmappedTags).toEqual(others.map((tag) => tag.name));
  });
});

describe("GET .../io problems", () => {
  it("is invalid with the position of an unknown tag", async () => {
    const csv = csvText(ALL()).replace(tags[0]?.name ?? "", "axis.ghost.setpoint");
    await writeIoFiles(axis, { csv, modules: MODULES_JSON });
    const { answer } = await readIo();
    expect(answer.status).toBe("invalid");
    expect(answer.problems).toMatchObject([
      { file: "io.csv", line: 2, column: 1, code: "unknown_tag" },
    ]);
    expect(answer.rows[0]).toMatchObject({ type: null, direction: null });
  });

  it("is invalid, with a problem, when io-modules.json is missing", async () => {
    await writeIoFiles(axis, { csv: csvText(ALL()) });
    const { answer } = await readIo();
    expect(answer.status).toBe("invalid");
    expect(answer.problems).toMatchObject([
      { file: "io-modules.json", line: null, column: null, code: "modules_missing" },
    ]);
    expect(answer.mappingId).not.toBeNull();
  });

  it("explains an io-modules.json that is not JSON or breaks a rule", async () => {
    await writeIoFiles(axis, { csv: csvText(ALL()), modules: "{nope" });
    expect((await readIo()).answer.problems[0]?.code).toBe("modules_invalid");
    const samePort = {
      schema_version: 1,
      modules: [
        { key: "m1", port: 1502 },
        { key: "m2", port: 1502 },
      ],
    };
    await writeIoFiles(axis, { modules: JSON.stringify(samePort) });
    expect((await readIo()).answer.problems[0]?.message).toContain(
      "Port 1502 is used by two modules",
    );
    const badUnit = { schema_version: 1, modules: [{ key: "m1", port: 1502, unitId: 0 }] };
    await writeIoFiles(axis, { modules: JSON.stringify(badUnit) });
    expect((await readIo()).answer.problems[0]?.message).toContain("modules.0.unitId");
  });
});

describe("GET .../io limits", () => {
  it("refuses a file over the size limit without reading it whole", async () => {
    await writeIoFiles(axis, { csv: "x".repeat(IO_FILE_MAX_BYTES + 1), modules: MODULES_JSON });
    expect((await readIo()).answer.problems[0]?.code).toBe("file_too_large");
  });

  it("does not follow an io.csv that is a link outside the Pantin folder", async () => {
    const folder = join(axis.workspace.pantinsDirectory, "axis");
    await symlink(axis.workspace.sentinelPath, join(folder, "io.csv"));
    const response = await sendRaw(axis.server, "GET", "/api/pantins/axis/io");
    expect(response.status).toBe(400);
    expect(response.body).not.toContain(SENTINEL_CONTENT);
  });

  it("does not follow an io.csv that is a link to a sibling Pantin's file", async () => {
    const sibling = join(axis.workspace.pantinsDirectory, "sibling");
    await mkdir(sibling);
    await writeFile(join(sibling, "io.csv"), SENTINEL_CONTENT);
    await symlink(join(sibling, "io.csv"), join(axis.workspace.pantinsDirectory, "axis", "io.csv"));
    const response = await sendRaw(axis.server, "GET", "/api/pantins/axis/io");
    expect(response.status).toBe(400);
    expect(response.body).not.toContain(SENTINEL_CONTENT);
  });

  it("answers 404 for a Pantin that does not exist", async () => {
    const response = await sendRaw(axis.server, "GET", "/api/pantins/ghost/io");
    expect(response.status).toBe(404);
  });
});

describe("GET .../io mappingId and the open document", () => {
  it("changes when io.csv changes, when io-modules.json changes, and only then", async () => {
    await writeIoFiles(axis, { csv: csvText(ALL()), modules: MODULES_JSON });
    const first = (await readIo()).answer.mappingId;
    expect((await readIo()).answer.mappingId).toBe(first);
    await writeIoFiles(axis, {
      csv: `${csvText(ALL())}`.replace(";;", ";a note;").replace(/\n$/, "\r\n"),
    });
    const afterCsv = (await readIo()).answer.mappingId;
    expect(afterCsv).not.toBe(first);
    await writeIoFiles(axis, { modules: MODULES_JSON.replace("1503", "1504") });
    expect((await readIo()).answer.mappingId).not.toBe(afterCsv);
  });

  it("does not blur the two files: moving a byte from one to the other changes the id", async () => {
    await writeIoFiles(axis, { csv: csvText(ALL()), modules: " " });
    const first = (await readIo()).answer.mappingId;
    await writeIoFiles(axis, { csv: `${csvText(ALL())} `, modules: "" });
    expect((await readIo()).answer.mappingId).not.toBe(first);
  });

  it("checks against the open document, unsaved edits included", async () => {
    await writeIoFiles(axis, { csv: csvText(ALL()), modules: MODULES_JSON });
    const deleted = await sendRaw(axis.server, "DELETE", "/api/pantins/axis/joints/stroke");
    expect(deleted.status).toBe(200);
    const { answer } = await readIo();
    expect(answer.status).toBe("invalid");
    expect(answer.problems.map((problem) => problem.code)).toContain("unknown_tag");
    const created = await sendJsonRequest(axis.server, "POST", "/api/pantins/axis/drives", {
      name: "Second valve",
      assembly: "carriage",
      type: "valve_5_3_closed",
    });
    expect(created.status).toBe(201);
    expect((await readIo()).answer.unmappedTags.length).toBeGreaterThan(0);
  });
});
