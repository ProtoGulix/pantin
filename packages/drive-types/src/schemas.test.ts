import { describe, expect, it } from "vitest";
import { DRIVE_LABELS } from "./labels.ts";
import { DRIVE_PARAMETERS, DRIVE_PORTS, DRIVE_TAGS, DriveFieldsSchema } from "./schemas.ts";

// The registries stay consistent with each drive type's schema (ADR 0022).

const TYPES = DriveFieldsSchema.options.map((option) => option.shape.type.value);
// The member pattern of the protocol's tag names (tag.ts).
const MEMBER = /^[a-z][a-z0-9_]{0,31}$/;

describe("drive type registries", () => {
  it.each(TYPES)("%s declares fields that its schema has, and valid tag members", (type) => {
    const option = DriveFieldsSchema.options.find((item) => item.shape.type.value === type);
    const fields = Object.keys(option?.shape ?? {});
    for (const parameter of DRIVE_PARAMETERS[type]) {
      expect(fields).toContain(parameter.field);
    }
    expect(DRIVE_TAGS[type].length).toBeGreaterThan(0);
    for (const tag of DRIVE_TAGS[type]) {
      expect(tag.member).toMatch(MEMBER);
      // A float tag says what it measures, so that clients can show its unit.
      expect(tag.type === "float").toBe(tag.quantity !== undefined);
    }
  });

  it.each(TYPES)("%s has a label for every parameter, tag and port, in each language", (type) => {
    for (const labels of Object.values(DRIVE_LABELS[type])) {
      expect(labels.name).not.toBe("");
      for (const parameter of DRIVE_PARAMETERS[type]) {
        expect(labels.parameters[parameter.field]).toBeTruthy();
      }
      for (const tag of DRIVE_TAGS[type]) {
        expect(labels.tags[tag.member]).toBeTruthy();
      }
      for (const port of DRIVE_PORTS[type]) {
        expect(labels.ports[port.name]).toBeTruthy();
      }
    }
  });
});
