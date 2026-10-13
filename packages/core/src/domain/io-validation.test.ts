import { describe, expect, it } from "vitest";
import { variableProblemOf } from "./io-identifiers.ts";
import type { IoListRow } from "./io-list.ts";
import { type IoTag, validateIoRows } from "./io-validation.ts";

// The errors and warnings of ADR 0045 point 7.

const TAGS: IoTag[] = [
  { name: "a.valve.coil_14", type: "bit", direction: "command" },
  { name: "a.sw.state", type: "bit", direction: "feedback" },
  { name: "a.axis.setpoint", type: "float", direction: "command" },
  { name: "a.axis.position", type: "float", direction: "feedback" },
  { name: "a.enc.count", type: "integer", direction: "feedback" },
];
const MODULES = new Set(["m1", "m2"]);
const COLUMNS = { tag: 1, variable: 2, module: 3, zone: 4, address: 5, type: 6 };

let nextLine = 2;
function row(overrides: Partial<IoListRow> = {}): IoListRow {
  const line = nextLine;
  nextLine += 1;
  return {
    line,
    tag: "a.valve.coil_14",
    variable: `var_${line}`,
    module: "m1",
    zone: "coil",
    address: 0,
    ioType: "BOOL",
    comment: "",
    columns: COLUMNS,
    ...overrides,
  };
}

function codesOf(rows: IoListRow[], moduleKeys: ReadonlySet<string> | null = MODULES): string[] {
  return validateIoRows({ rows, tags: TAGS, moduleKeys }).problems.map((problem) => problem.code);
}

describe("validateIoRows tags and modules", () => {
  it("accepts a consistent mapping and lists the unmapped tags as a warning", () => {
    const result = validateIoRows({
      rows: [row(), row({ tag: "a.axis.setpoint", zone: "holding_register", ioType: "REAL" })],
      tags: TAGS,
      moduleKeys: MODULES,
    });
    expect(result.problems).toEqual([]);
    expect(result.unmappedTags).toEqual(["a.sw.state", "a.axis.position", "a.enc.count"]);
  });

  it("maps every tag kind to its zone and type", () => {
    const rows = [
      row(),
      row({ tag: "a.sw.state", zone: "discrete_input" }),
      row({ tag: "a.axis.setpoint", zone: "holding_register", ioType: "REAL" }),
      row({ tag: "a.axis.position", zone: "input_register", ioType: "REAL" }),
      row({ tag: "a.enc.count", zone: "input_register", ioType: "DINT", address: 2 }),
    ];
    expect(codesOf(rows)).toEqual([]);
  });

  it("refuses an unknown tag, with its position", () => {
    const result = validateIoRows({
      rows: [row({ tag: "a.ghost.coil_1", columns: { ...COLUMNS, tag: 9 } })],
      tags: TAGS,
      moduleKeys: MODULES,
    });
    expect(result.problems).toMatchObject([{ code: "unknown_tag", column: 9 }]);
  });

  it("refuses a tag mapped twice, on the second row, naming the first", () => {
    const first = row();
    const second = row({ address: 1 });
    const { problems } = validateIoRows({ rows: [first, second], tags: TAGS, moduleKeys: MODULES });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: "duplicate_tag", line: second.line });
    expect(problems[0]?.message).toContain(`line ${first.line}`);
  });

  it("refuses an unknown module, and skips that check without a usable io-modules.json", () => {
    const rows = [row({ module: "m9" })];
    expect(codesOf(rows)).toEqual(["unknown_module"]);
    expect(codesOf(rows, null)).toEqual([]);
  });
});

describe("validateIoRows zones, types and addresses", () => {
  it("refuses a zone that does not match the direction", () => {
    expect(codesOf([row({ tag: "a.valve.coil_14", zone: "discrete_input" })])).toEqual([
      "zone_direction_mismatch",
    ]);
    expect(
      codesOf([row({ tag: "a.axis.position", zone: "holding_register", ioType: "REAL" })]),
    ).toEqual(["zone_direction_mismatch"]);
  });

  it("refuses a type that does not match the tag type", () => {
    expect(
      codesOf([row({ tag: "a.axis.setpoint", zone: "holding_register", ioType: "DINT" })]),
    ).toEqual(["type_mismatch"]);
    expect(codesOf([row({ tag: "a.enc.count", zone: "input_register", ioType: "REAL" })])).toEqual([
      "type_mismatch",
    ]);
    expect(codesOf([row({ ioType: "REAL" })])).toContain("type_mismatch");
  });

  it("refuses a type in the wrong kind of zone", () => {
    expect(codesOf([row({ zone: "holding_register" })])).toContain("type_zone_mismatch");
    expect(codesOf([row({ tag: "a.axis.setpoint", zone: "coil", ioType: "REAL" })])).toContain(
      "type_zone_mismatch",
    );
  });

  it("refuses an address out of 0..65535, a REAL needing two registers", () => {
    expect(codesOf([row({ address: -1 })])).toEqual(["address_out_of_range"]);
    expect(codesOf([row({ address: 65535 })])).toEqual([]);
    expect(codesOf([row({ address: 65536 })])).toEqual(["address_out_of_range"]);
    const real = (address: number) =>
      row({ tag: "a.axis.setpoint", zone: "holding_register", ioType: "REAL", address });
    expect(codesOf([real(65534)])).toEqual([]);
    expect(codesOf([real(65535)])).toEqual(["address_out_of_range"]);
  });
});

describe("overlaps", () => {
  it("takes two registers for a REAL or a DINT", () => {
    const a = row({ tag: "a.axis.setpoint", zone: "holding_register", ioType: "REAL", address: 4 });
    const b = row({ tag: "a.valve.coil_14", zone: "holding_register", ioType: "DINT", address: 5 });
    const { problems } = validateIoRows({ rows: [a, b], tags: TAGS, moduleKeys: MODULES });
    expect(problems.filter((problem) => problem.code === "address_overlap")).toMatchObject([
      { line: b.line },
    ]);
    expect(problems[0]?.message).toContain(`line ${a.line}`);
  });

  it("accepts neighbours, other zones and other modules at the same address", () => {
    const base = { zone: "holding_register", ioType: "REAL" } as const;
    const rows = [
      row({ ...base, tag: "a.axis.setpoint", address: 0 }),
      row({ ...base, tag: "a.valve.coil_14", ioType: "DINT", address: 2 }),
      row({ ...base, tag: "a.sw.state", module: "m2", address: 0 }),
      row({ tag: "a.axis.position", zone: "input_register", ioType: "REAL", address: 0 }),
    ];
    expect(codesOf(rows).filter((code) => code === "address_overlap")).toEqual([]);
  });

  it("finds two bits at the same address, and reports a chain once per overlapping row", () => {
    expect(
      codesOf([row({ address: 3 }), row({ tag: "a.sw.state", zone: "coil", address: 3 })]).filter(
        (code) => code === "address_overlap",
      ),
    ).toHaveLength(1);
    const wide = row({
      tag: "a.axis.setpoint",
      zone: "holding_register",
      ioType: "REAL",
      address: 0,
    });
    const inside = row({
      tag: "a.valve.coil_14",
      zone: "holding_register",
      ioType: "REAL",
      address: 1,
    });
    const after = row({ tag: "a.sw.state", zone: "holding_register", ioType: "REAL", address: 3 });
    const codes = codesOf([wide, inside, after]).filter((code) => code === "address_overlap");
    expect(codes).toHaveLength(1);
  });

  it("does not report an overlap for an address already out of range", () => {
    expect(
      codesOf([row({ address: -1 }), row({ tag: "a.sw.state", zone: "coil", address: -1 })]),
    ).not.toContain("address_overlap");
  });
});

describe("variables", () => {
  it("refuses an invalid variable, at its column", () => {
    for (const variable of ["1abc", "a__b", "_a", "a_", "a-b", "a b", "", "é", "x".repeat(65)]) {
      expect(codesOf([row({ variable })])).toEqual(["invalid_variable"]);
    }
    expect(codesOf([row({ variable: "x".repeat(64) })])).toEqual([]);
    expect(codesOf([row({ variable: "t_1abc" })])).toEqual([]);
  });

  it("refuses an IEC keyword or type name whatever its case", () => {
    for (const variable of ["VAR", "end_if", "Bool", "real", "Time_Of_Day"]) {
      expect(variableProblemOf(variable)).toContain("keyword");
    }
    expect(variableProblemOf("variable_1")).toBeNull();
  });

  it("refuses a duplicate variable without regard to case, on the later row", () => {
    const first = row({ variable: "Coil" });
    const second = row({ tag: "a.sw.state", zone: "discrete_input", variable: "COIL" });
    const { problems } = validateIoRows({ rows: [first, second], tags: TAGS, moduleKeys: MODULES });
    expect(problems).toMatchObject([{ code: "duplicate_variable", line: second.line }]);
  });
});

describe("problem order", () => {
  it("sorts problems by line then column", () => {
    const late = row({ tag: "a.ghost.x", variable: "1" });
    const early = row({ module: "m9", columns: { ...COLUMNS, module: 1 } });
    const { problems } = validateIoRows({ rows: [late, early], tags: TAGS, moduleKeys: MODULES });
    expect(problems.map((problem) => problem.line)).toEqual(
      [...problems.map((p) => p.line)].sort((a, b) => a - b),
    );
  });
});
