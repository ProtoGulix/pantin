import { describe, expect, it } from "vitest";
import { IoMappingResponseSchema } from "./io-mapping.ts";

describe("IoMappingResponseSchema", () => {
  it("accepts the answer for a missing mapping", () => {
    const missing = {
      status: "missing",
      mappingId: null,
      modules: [],
      problems: [],
      unmappedTags: [
        { name: "a.b.c", type: "bit", direction: "command", owner: { kind: "drive", id: "d" } },
      ],
    };
    expect(IoMappingResponseSchema.parse(missing)).toEqual(missing);
  });

  it("refuses a status or a problem code it does not know", () => {
    const base = { mappingId: null, modules: [], unmappedTags: [] };
    expect(IoMappingResponseSchema.safeParse({ ...base, status: "ok", problems: [] }).success).toBe(
      false,
    );
    const problem = { path: [], code: "nope", message: "" };
    expect(
      IoMappingResponseSchema.safeParse({ ...base, status: "invalid", problems: [problem] })
        .success,
    ).toBe(false);
  });

  it("refuses the removed codes of the CSV and a problem with a file or line", () => {
    const base = { status: "invalid", mappingId: null, modules: [], unmappedTags: [] };
    const csvCode = { path: [], code: "bad_header", message: "" };
    const withLine = { file: "io.csv", line: 3, column: 1, code: "unknown_tag", message: "" };
    for (const problem of [csvCode, withLine]) {
      expect(IoMappingResponseSchema.safeParse({ ...base, problems: [problem] }).success).toBe(
        false,
      );
    }
  });
});
