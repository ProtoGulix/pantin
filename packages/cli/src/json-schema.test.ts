import { readFile } from "node:fs/promises";
import { IO_SCHEMA_VERSION, IoDocumentSchema, PANTIN_SCHEMA_VERSION } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { ioJsonSchema, pantinJsonSchema } from "./json-schema.ts";

// ADR 0021 point 2: the committed JSON Schema is the one the Zod schema gives.
const COMMITTED = new URL("../../protocol/schema/pantin.schema.json", import.meta.url);
const COMMITTED_IO = new URL("../../protocol/schema/io.schema.json", import.meta.url);

describe("committed JSON Schema", () => {
  it("matches a fresh generation: run `pnpm schema:generate` after a schema change", async () => {
    const committed: unknown = JSON.parse(await readFile(COMMITTED, "utf8"));
    expect(committed).toEqual(pantinJsonSchema());
  });

  it("pins the current schema version", () => {
    expect(JSON.stringify(pantinJsonSchema())).toContain(`"const":${PANTIN_SCHEMA_VERSION}`);
  });
});

// ADR 0049 point 2: io.json is a second public schema, kept the same way.
describe("committed io JSON Schema", () => {
  it("matches a fresh generation: run `pnpm schema:generate` after a schema change", async () => {
    const committed: unknown = JSON.parse(await readFile(COMMITTED_IO, "utf8"));
    expect(committed).toEqual(ioJsonSchema());
  });

  it("pins the current schema version and refuses unknown fields", () => {
    const schema = JSON.stringify(ioJsonSchema());
    expect(schema).toContain(`"const":${IO_SCHEMA_VERSION}`);
    expect(schema).toContain('"additionalProperties":false');
  });

  it("describes what the Zod schema accepts: an example validates, a typo does not", () => {
    const transport = { kind: "modbus_tcp_slave", port: 1502 };
    const example = { schema_version: 2, modules: [{ key: "m1", transport, channels: [] }] };
    expect(IoDocumentSchema.safeParse(example).success).toBe(true);
    expect(IoDocumentSchema.safeParse({ ...example, modulez: [] }).success).toBe(false);
  });
});
