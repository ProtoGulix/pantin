import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ConsoleEventSchema } from "./console.ts";

// The Python bridge cannot import Zod, so it checks the level of each console
// code against this fixture (ADR 0045 point 2). A code added to the schema
// without the fixture fails here, and so does the bridge's own table.
describe("fixtures/console-codes.json", () => {
  it("lists every console code with its level", () => {
    const fromSchema = Object.fromEntries(
      ConsoleEventSchema.options.map((option) => [
        option.shape.code.value,
        option.shape.level.value,
      ]),
    );
    const fixture: unknown = JSON.parse(
      readFileSync(new URL("../fixtures/console-codes.json", import.meta.url), "utf8"),
    );
    expect(fixture).toEqual(fromSchema);
  });
});
