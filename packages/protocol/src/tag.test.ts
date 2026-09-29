import { describe, expect, it } from "vitest";
import { TagNameSchema, TagSchema, WriteTagRequestSchema } from "./tag.ts";

describe("TagNameSchema", () => {
  it.each(["stroke.setpoint", "axis-1.position", "a.b"])("accepts %s", (name) => {
    expect(TagNameSchema.safeParse(name).success).toBe(true);
  });

  it.each(["stroke", "stroke.", ".setpoint", "a.b.c", "Stroke.setpoint", "a/b.c", "../x.y"])(
    "refuses %s",
    (name) => {
      expect(TagNameSchema.safeParse(name).success).toBe(false);
    },
  );
});

describe("TagSchema", () => {
  it("accepts a float command", () => {
    const tag = { name: "stroke.setpoint", type: "float", direction: "command", value: 0.05 };
    expect(TagSchema.parse(tag)).toEqual(tag);
  });

  it("refuses an unknown direction", () => {
    const tag = { name: "stroke.setpoint", type: "float", direction: "input", value: 0 };
    expect(TagSchema.safeParse(tag).success).toBe(false);
  });
});

describe("WriteTagRequestSchema", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, "1", null])("refuses %s", (value) => {
    expect(WriteTagRequestSchema.safeParse({ value }).success).toBe(false);
  });
});
