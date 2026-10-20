import { createHash } from "node:crypto";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { IO_FILE_MAX_BYTES, IoMappingResponseSchema, type Tag } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type BusAxis, startBusAxis } from "../test-support/bus-axis.ts";
import { listTags } from "../test-support/bus-rest.ts";
import {
  discardAxis,
  ioDocumentOf,
  ioTextOf,
  loadIo,
  writeIoJsonFile,
} from "../test-support/io-files.ts";
import { SENTINEL_CONTENT, sendJsonRequest, sendRaw } from "../test-support/test-server.ts";

// GET /api/pantins/:pantinId/io (ADR 0049 points 3 to 8).

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
  it("is missing, with every tag unmapped and its owner, when there is no io.json", async () => {
    const { status, answer } = await readIo();
    expect(status).toBe(200);
    expect(answer).toMatchObject({ status: "missing", mappingId: null, modules: [], problems: [] });
    expect(answer.unmappedTags.map((tag) => tag.name)).toEqual(tags.map((tag) => tag.name));
    expect(answer.unmappedTags.find((tag) => tag.name.includes("valve"))?.owner).toEqual({
      kind: "drive",
      id: "valve",
    });
  });

  it("is valid for a consistent mapping, each channel annotated with its tag", async () => {
    await loadIo(axis, ioTextOf(ALL()));
    const { answer } = await readIo();
    expect(answer.status).toBe("valid");
    expect(answer.problems).toEqual([]);
    expect(answer.unmappedTags).toEqual([]);
    expect(answer.mappingId).toMatch(/^[0-9a-f]{64}$/);
    expect(answer.modules.map((module) => module.key)).toEqual(["m1", "m2"]);
    const channels = answer.modules.flatMap((module) => module.channels);
    expect(channels.map((channel) => [channel.tag, channel.tagType, channel.direction])).toEqual(
      expect.arrayContaining(tags.map((tag) => [tag.name, tag.type, tag.direction])),
    );
    expect(channels.every((channel) => channel.owner !== null)).toBe(true);
  });

  it("lists as unmapped, and still valid, a tag that no channel maps", async () => {
    const [first, ...others] = tags;
    await loadIo(axis, ioTextOf(onM1(first ? [first.name] : [])));
    const { answer } = await readIo();
    expect(answer.status).toBe("valid");
    expect(answer.unmappedTags.map((tag) => tag.name)).toEqual(others.map((tag) => tag.name));
  });

  it("does not read the file again: an outside edit shows after a discard", async () => {
    await loadIo(axis, ioTextOf(ALL()));
    await writeIoJsonFile(axis, ioTextOf([]));
    expect((await readIo()).answer.modules.flatMap((module) => module.channels)).not.toEqual([]);
    await discardAxis(axis);
    expect((await readIo()).answer.modules.flatMap((module) => module.channels)).toEqual([]);
  });
});

describe("GET .../io problems", () => {
  it("is invalid with the path of an unknown tag, and null annotations", async () => {
    const document = ioDocumentOf(ALL());
    const channel = document.modules[0]?.channels[0];
    if (channel === undefined) {
      throw new Error("The axis should have a tag.");
    }
    channel.tag = "axis.ghost.setpoint";
    await loadIo(axis, `${JSON.stringify(document)}\n`);
    const { answer } = await readIo();
    expect(answer.status).toBe("invalid");
    const found = answer.modules[0]?.channels.findIndex((c) => c.tag === "axis.ghost.setpoint");
    expect(answer.problems).toMatchObject([
      { path: ["modules", 0, "channels", found, "tag"], code: "unknown_tag" },
    ]);
    expect(answer.modules[0]?.channels[found ?? 0]).toMatchObject({
      tagType: null,
      direction: null,
      owner: null,
    });
  });
});

describe("GET .../io unreadable file", () => {
  it("is invalid, with no module, for a file that is not JSON", async () => {
    await loadIo(axis, "{nope");
    const { answer } = await readIo();
    expect(answer).toMatchObject({ status: "invalid", mappingId: null, modules: [] });
    expect(answer.problems).toMatchObject([{ path: [], code: "invalid_json" }]);
    expect(answer.unmappedTags).toHaveLength(tags.length);
  });

  it("is invalid with one schema_invalid problem per Zod issue, at its path", async () => {
    const document = {
      schema_version: 1,
      modules: [
        { key: "m1", port: 1502, channels: [] },
        { key: "m2", port: 1502, unitId: 0, channels: [] },
      ],
    };
    await loadIo(axis, JSON.stringify(document));
    const { answer } = await readIo();
    expect(answer.problems.map((problem) => [problem.code, problem.path])).toEqual([
      ["schema_invalid", ["modules", 1, "unitId"]],
      ["schema_invalid", ["modules", 1, "port"]],
    ]);
    expect(answer.problems[1]?.message).toContain("Port 1502 is used by two modules");
  });

  it("reports a tag mapped twice at the second channel", async () => {
    const document = ioDocumentOf(ALL());
    const first = document.modules[0]?.channels[0];
    const second = document.modules[1];
    if (first === undefined || second === undefined) {
      throw new Error("The axis should have a tag.");
    }
    second.channels.push({ ...first, address: 40, variable: "again" });
    await loadIo(axis, JSON.stringify(document));
    const { answer } = await readIo();
    expect(answer.problems).toMatchObject([
      { path: ["modules", 1, "channels", 0, "tag"], code: "schema_invalid" },
    ]);
  });

  it("is invalid for bytes that are not UTF-8", async () => {
    await loadIo(axis, "{}");
    await writeFile(join(axis.workspace.pantinsDirectory, "axis", "io.json"), Uint8Array.of(0xff));
    await discardAxis(axis);
    expect((await readIo()).answer.problems).toMatchObject([{ code: "invalid_encoding" }]);
  });

  it("skips a byte order mark", async () => {
    await loadIo(axis, `﻿${ioTextOf(ALL())}`);
    expect((await readIo()).answer.status).toBe("valid");
  });
});

describe("GET .../io limits", () => {
  it("refuses a file over the size limit without reading it whole", async () => {
    await loadIo(axis, "x".repeat(IO_FILE_MAX_BYTES + 1));
    expect((await readIo()).answer.problems[0]?.code).toBe("file_too_large");
  });

  it("does not follow an io.json that is a link outside the Pantin folder", async () => {
    const folder = join(axis.workspace.pantinsDirectory, "axis");
    await symlink(axis.workspace.sentinelPath, join(folder, "io.json"));
    const response = await sendRaw(axis.server, "POST", "/api/pantins/axis/discard");
    expect(response.status).toBe(200);
    expect(response.body).not.toContain(SENTINEL_CONTENT);
    const { answer } = await readIo();
    expect(answer).toMatchObject({ status: "invalid", mappingId: null });
    expect(answer.problems).toMatchObject([{ path: [], code: "unreadable_file" }]);
  });

  it("does not follow an io.json that is a link to a sibling Pantin's file", async () => {
    const sibling = join(axis.workspace.pantinsDirectory, "sibling");
    await mkdir(sibling);
    await writeFile(join(sibling, "io.json"), SENTINEL_CONTENT);
    const link = join(axis.workspace.pantinsDirectory, "axis", "io.json");
    await symlink(join(sibling, "io.json"), link);
    const response = await sendRaw(axis.server, "POST", "/api/pantins/axis/discard");
    expect(response.status).toBe(200);
    expect(response.body).not.toContain(SENTINEL_CONTENT);
    const { answer } = await readIo();
    expect(answer).toMatchObject({ status: "invalid", mappingId: null });
    expect(answer.problems).toMatchObject([{ path: [], code: "unreadable_file" }]);
  });

  it("opens and discards the Pantin when io.json is a directory", async () => {
    await mkdir(join(axis.workspace.pantinsDirectory, "axis", "io.json"));
    await discardAxis(axis);
    const problem = (await readIo()).answer.problems[0];
    expect(problem?.code).toBe("unreadable_file");
    expect(problem?.message).toContain("EISDIR");
  });

  it("answers 404 for a Pantin that does not exist", async () => {
    const response = await sendRaw(axis.server, "GET", "/api/pantins/ghost/io");
    expect(response.status).toBe(404);
  });
});

describe("GET .../io mappingId", () => {
  it("is the SHA-256 of the canonical text, whatever the formatting of the file", async () => {
    const canonical = ioTextOf(ALL());
    await loadIo(axis, canonical);
    const first = (await readIo()).answer.mappingId;
    expect(first).toBe(createHash("sha256").update(canonical).digest("hex"));
    expect((await readIo()).answer.mappingId).toBe(first);
    // Same mapping, minified and with the channels in reverse order.
    const document = ioDocumentOf(ALL());
    for (const module of document.modules) {
      module.channels.reverse();
    }
    await loadIo(axis, JSON.stringify(document));
    expect((await readIo()).answer.mappingId).toBe(first);
  });

  it("changes when the mapping changes, and is null without a usable mapping", async () => {
    await loadIo(axis, ioTextOf(ALL()));
    const first = (await readIo()).answer.mappingId;
    await loadIo(axis, ioTextOf(onM1(tags.slice(1).map((tag) => tag.name))));
    const second = (await readIo()).answer.mappingId;
    expect(second).not.toBe(first);
    expect(second).not.toBeNull();
    await loadIo(axis, "{nope");
    expect((await readIo()).answer.mappingId).toBeNull();
  });

  it("checks against the open document, unsaved edits included", async () => {
    await loadIo(axis, ioTextOf(ALL()));
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
