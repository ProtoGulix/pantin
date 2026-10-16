import { IoMappingResponseSchema, type Tag } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderGvl } from "../domain/gvl.ts";
import { type BusAxis, startBusAxis } from "../test-support/bus-axis.ts";
import { listTags } from "../test-support/bus-rest.ts";
import { ioTextOf, loadIo } from "../test-support/io-files.ts";
import { sendRaw } from "../test-support/test-server.ts";

// GET /api/pantins/:pantinId/io/gvl (ADR 0049 amendment): the CODESYS global
// variable list of the open mapping, as a text download.

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
const readGvl = () => sendRaw(axis.server, "GET", "/api/pantins/axis/io/gvl");

describe("GET .../io/gvl", () => {
  it("answers the GVL of a valid mapping as a plain text download", async () => {
    await loadIo(axis, ioTextOf(everyTag()));
    const response = await readGvl();
    expect(response.status).toBe(200);
    expect(response.contentType).toBe("text/plain; charset=utf-8");
    expect(response.contentDisposition).toBe('attachment; filename="axis.gvl"');
    expect(response.body).toContain("VAR_GLOBAL\n");
    for (const tag of tags) {
      expect(response.body).toContain(`, ${tag.name}\n`);
    }
  });

  it("is the text the generator renders for the answer of GET .../io", async () => {
    await loadIo(axis, ioTextOf(everyTag()));
    const io = await sendRaw(axis.server, "GET", "/api/pantins/axis/io");
    const { modules } = IoMappingResponseSchema.parse(io.json);
    expect((await readGvl()).body).toBe(renderGvl(modules));
  });

  it("is refused with a 409 and the way out when there is no io.json", async () => {
    const response = await readGvl();
    expect(response.status).toBe(409);
    expect(response.json).toMatchObject({ error: { code: "conflict" } });
    expect(response.body).toContain("no io.json");
  });

  it("is refused with a 409 naming the problems when the mapping is invalid", async () => {
    await loadIo(axis, "{nope");
    const response = await readGvl();
    expect(response.status).toBe(409);
    expect(response.body).toContain("The mapping is invalid, so no GVL is generated");
    expect(response.body).toContain("io.json:");
  });

  it("answers 404 for a Pantin that does not exist", async () => {
    const response = await sendRaw(axis.server, "GET", "/api/pantins/ghost/io/gvl");
    expect(response.status).toBe(404);
  });
});
