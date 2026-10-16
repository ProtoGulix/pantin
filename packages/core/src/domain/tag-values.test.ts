import { describe, expect, it } from "vitest";
import { tagValueProblem } from "./tag-values.ts";

describe("tagValueProblem", () => {
  it.each([0, 1])("accepts %s on a bit", (value) => {
    expect(tagValueProblem("a.b.c", "bit", value)).toBeNull();
  });

  it.each([2, -1, 0.5, 1e-9])("refuses %s on a bit, naming the tag", (value) => {
    expect(tagValueProblem("a.b.c", "bit", value)).toBe('Tag "a.b.c" is a bit: write 0 or 1.');
  });

  it.each([0, 7, -3, 2147483647, 4294967296])(
    "accepts the whole number %s on an integer",
    (value) => {
      expect(tagValueProblem("a.b.c", "integer", value)).toBeNull();
    },
  );

  it.each([0.5, -1.25])("refuses %s on an integer", (value) => {
    expect(tagValueProblem("a.b.c", "integer", value)).toBe(
      'Tag "a.b.c" is an integer: write a whole number.',
    );
  });

  it.each([0, 0.0123, -5, 1e9])("accepts %s on a float", (value) => {
    expect(tagValueProblem("a.b.c", "float", value)).toBeNull();
  });
});
