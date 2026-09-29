import { describe, expect, it } from "vitest";
import { TagNameSchema, TagSchema, WriteTagRequestSchema } from "./tag.ts";

describe("TagNameSchema", () => {
  it.each(["verin_pince.tige.setpoint", "axis-1.stroke.position", "a.b.c"])(
    "accepts %s",
    (name) => {
      expect(TagNameSchema.safeParse(name).success).toBe(true);
    },
  );

  it.each([
    "stroke.setpoint",
    "a.b.",
    ".b.setpoint",
    "a.b.c.d",
    "Axis.stroke.setpoint",
    "a/b.c.d",
    "../x.y.z",
    "_a.b.setpoint",
  ])("refuses %s", (name) => {
    expect(TagNameSchema.safeParse(name).success).toBe(false);
  });
});

describe("TagSchema", () => {
  it("accepts a float command", () => {
    const tag = { name: "axis.stroke.setpoint", type: "float", direction: "command", value: 0.05 };
    expect(TagSchema.parse(tag)).toEqual(tag);
  });

  it("refuses an unknown direction", () => {
    const tag = { name: "axis.stroke.setpoint", type: "float", direction: "input", value: 0 };
    expect(TagSchema.safeParse(tag).success).toBe(false);
  });
});

describe("WriteTagRequestSchema", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, "1", null])("refuses %s", (value) => {
    expect(WriteTagRequestSchema.safeParse({ value }).success).toBe(false);
  });
});
