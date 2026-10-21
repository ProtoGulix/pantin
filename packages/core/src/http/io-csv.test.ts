import { IoMappingResponseSchema, type Tag } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderIoCsv } from "../domain/io-csv.ts";
import { type BusAxis, startBusAxis } from "../test-support/bus-axis.ts";
import { listTags } from "../test-support/bus-rest.ts";
import { ioTextOf, loadIo } from "../test-support/io-files.ts";
import { sendRaw } from "../test-support/test-server.ts";

// GET /api/pantins/:pantinId/io/csv (ADR 0049 amendment of 2026-10-20): the
// open mapping as a spreadsheet download, refused like the GVL when invalid.

let axis: BusAxis;
let tags: Tag[];

beforeEach(async () => {
  axis = await startBusAxis();
  tags = await listTags(axis);
});

afterEach(async () => {
  await axis.close();
});

const everyTag = () => tags.map((tag) => ({ tag, module: "m1" }));
const readCsv = () => sendRaw(axis.server, "GET", "/api/pantins/axis/io/csv");

describe("GET .../io/csv", () => {
  it("answers the CSV of a valid mapping as a download", async () => {
    await loadIo(axis, ioTextOf(everyTag()));
    const response = await readCsv();
    expect(response.status).toBe(200);
    expect(response.contentType).toBe("text/csv; charset=utf-8");
    expect(response.contentDisposition).toBe('attachment; filename="axis-io.csv"');
    expect(response.body.startsWith("﻿module,transport,")).toBe(true);
    for (const tag of tags) {
      expect(response.body).toContain(`,${tag.name},`);
    }
  });

  it("is the text the renderer gives for the answer of GET .../io", async () => {
    await loadIo(axis, ioTextOf(everyTag()));
    const io = await sendRaw(axis.server, "GET", "/api/pantins/axis/io");
    const { modules } = IoMappingResponseSchema.parse(io.json);
    expect((await readCsv()).body).toBe(renderIoCsv(modules));
  });

  it("is refused with a 409 and the way out when there is no io.json", async () => {
    const response = await readCsv();
    expect(response.status).toBe(409);
    expect(response.body).toContain("no io.json");
  });

  it("is refused with a 409 naming the problems when the mapping is invalid", async () => {
    await loadIo(axis, "{nope");
    const response = await readCsv();
    expect(response.status).toBe(409);
    expect(response.body).toContain("The mapping is invalid, so no CSV is generated");
  });

  it("answers 404 for a Pantin that does not exist", async () => {
    const response = await sendRaw(axis.server, "GET", "/api/pantins/ghost/io/csv");
    expect(response.status).toBe(404);
  });
});
