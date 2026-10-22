import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deriveVariable, isDottedVariable, variableProblemOf } from "./io-identifiers.ts";

// The derivation of a CODESYS variable from a tag name (ADR 0045 point 9).

describe("deriveVariable", () => {
  it.each([
    ["axis.stroke.setpoint", "axis_stroke_setpoint"],
    ["verin-pince.tige-1.position", "verin_pince_tige_1_position"],
    ["a__b.c_.d", "a_b_c_d"],
    ["_a.b._c", "a_b_c"],
    ["1a.2b.coil_14", "t_1a_2b_coil_14"],
    ["a.-b.c", "a_b_c"],
  ])("%s -> %s", (tag, variable) => {
    expect(deriveVariable(tag)).toBe(variable);
  });

  it("cuts a name over 64 characters at 56 and appends 7 hash characters of the tag name", () => {
    const tag = `${"abcdefgh-".repeat(7)}x.${"y".repeat(10)}.position`;
    const hash = createHash("sha256").update(tag).digest("hex").slice(0, 7);
    const variable = deriveVariable(tag);
    expect(variable).toBe(`${"abcdefgh_".repeat(6)}ab_${hash}`);
    expect(variable).toHaveLength(64);
    expect(variableProblemOf(variable)).toBeNull();
  });

  it("removes the underscore left at the cut before the hash", () => {
    const tag = `${"a".repeat(55)}.${"b".repeat(20)}.c`;
    const hash = createHash("sha256").update(tag).digest("hex").slice(0, 7);
    expect(deriveVariable(tag)).toBe(`${"a".repeat(55)}_${hash}`);
  });

  it("leaves a name of exactly 64 characters alone", () => {
    const tag = `${"a".repeat(30)}.${"b".repeat(30)}.c`;
    expect(deriveVariable(tag)).toHaveLength(63);
    const exact = `${"a".repeat(30)}.${"b".repeat(31)}.c`;
    expect(deriveVariable(exact)).toBe(exact.replaceAll(".", "_"));
  });

  it("gives a name the core accepts, or only refuses it as a keyword, for the names tags can have", () => {
    for (const tag of [
      "end.if.x",
      "a.b.c",
      "9.9.z",
      `${"k".repeat(64)}.${"k".repeat(64)}.member`,
    ]) {
      const problem = variableProblemOf(deriveVariable(tag));
      expect(problem === null || problem.code === "variable_reserved_name").toBe(true);
    }
  });
});

describe("variableProblemOf, dotted references (ADR 0064 point 9)", () => {
  it.each(["GVL_IO.Verin1.FinCourseSortie", "PLC_PRG.ok", "a.b.c.d.e.f.g.h"])(
    "accepts %s",
    (reference) => {
      expect(variableProblemOf(reference)).toBeNull();
    },
  );

  it.each([
    ["a.b.c.d.e.f.g.h.i", "variable_too_many_parts", "more than 8"],
    ["GVL.", "variable_invalid_name", "must start with a letter"],
    [".a", "variable_invalid_name", "must start with a letter"],
    ["a..b", "variable_invalid_name", "must start with a letter"],
    ["a.1b", "variable_invalid_name", "must start with a letter"],
    ["GVL.BOOL", "variable_reserved_name", "keyword"],
    ["a.b__c", "variable_invalid_name", "double underscore"],
  ])("refuses %s, naming the rule", (reference, code, fragment) => {
    const problem = variableProblemOf(reference);
    expect(problem?.code).toBe(code);
    expect(problem?.message).toContain(fragment);
  });

  it("gives the whole reference and the part at fault as values", () => {
    expect(variableProblemOf("GVL.BOOL")?.values).toEqual({
      variable: "BOOL",
      reference: "GVL.BOOL",
    });
  });

  it("refuses a reference over 255 characters, and an identifier over 64 inside it", () => {
    const part = "a".repeat(60);
    expect(variableProblemOf([part, part, part, part, part].join("."))).toMatchObject({
      code: "variable_too_long",
      values: { max: "255" },
    });
    expect(variableProblemOf(`${"b".repeat(65)}.c`)).toMatchObject({
      code: "variable_too_long",
      values: { max: "64" },
    });
  });

  it("keeps the message of a plain identifier unchanged", () => {
    expect(variableProblemOf("BOOL")?.message).toBe(
      'Variable "BOOL" is an IEC 61131-3 keyword or type name.',
    );
  });

  it("tells a dotted reference from a variable Pantin declares", () => {
    expect(isDottedVariable("GVL_IO.Verin1")).toBe(true);
    expect(isDottedVariable("verin1_sortie")).toBe(false);
  });
});
