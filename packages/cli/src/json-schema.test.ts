import { readFile } from "node:fs/promises";
import { PANTIN_SCHEMA_VERSION } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { pantinJsonSchema } from "./json-schema.ts";

// ADR 0021 point 2: the committed JSON Schema is the one the Zod schema gives.
const COMMITTED = new URL("../../protocol/schema/pantin.schema.json", import.meta.url);

describe("committed JSON Schema", () => {
  it("matches a fresh generation: run `pnpm schema:generate` after a schema change", async () => {
    const committed: unknown = JSON.parse(await readFile(COMMITTED, "utf8"));
    expect(committed).toEqual(pantinJsonSchema());
  });

  it("pins the current schema version", () => {
    expect(JSON.stringify(pantinJsonSchema())).toContain(`"const":${PANTIN_SCHEMA_VERSION}`);
  });
});
