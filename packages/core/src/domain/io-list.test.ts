import { IO_LIST_HEADER } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { decodeIoList, parseIoList } from "./io-list.ts";

// The strict parser of io.csv (ADR 0045 point 6).

const ROW = "axis.stroke.setpoint;axis_stroke_setpoint;m1;holding_register;0;REAL;note";

function file(...lines: string[]): string {
  return `${[IO_LIST_HEADER, ...lines].join("\n")}\n`;
}

function problemsOf(text: string) {
  return parseIoList(text).problems.map(({ line, column, code }) => ({ line, column, code }));
}

describe("parseIoList rows", () => {
  it("reads a row with its line, fields and the column each field starts at", () => {
    const { rows, problems } = parseIoList(file(ROW));
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      {
        line: 2,
        tag: "axis.stroke.setpoint",
        variable: "axis_stroke_setpoint",
        module: "m1",
        zone: "holding_register",
        address: 0,
        ioType: "REAL",
        comment: "note",
        columns: { tag: 1, variable: 22, module: 43, zone: 46, address: 63, type: 65 },
      },
    ]);
  });

  it("accepts an empty comment, a comment with spaces and a header-only file", () => {
    expect(parseIoList(file("a.b.c;v;m1;coil;3;BOOL;")).rows[0]?.comment).toBe("");
    expect(parseIoList(file("a.b.c;v;m1;coil;3;BOOL;some words, here")).rows[0]?.comment).toBe(
      "some words, here",
    );
    expect(parseIoList(file())).toEqual({ rows: [], problems: [] });
  });

  it("does not trim: spaces stay in the fields", () => {
    const [row] = parseIoList(file(" a.b.c ;v;m1;coil;3;BOOL;")).rows;
    expect(row?.tag).toBe(" a.b.c ");
    expect(problemsOf(file("a.b.c;v;m1; coil;3;BOOL;"))).toEqual([
      { line: 2, column: 12, code: "invalid_zone" },
    ]);
  });

  it("keeps every well formed row beside a bad one", () => {
    const parsed = parseIoList(file(ROW, "broken", ROW));
    expect(parsed.rows.map((row) => row.line)).toEqual([2, 4]);
    expect(parsed.problems).toHaveLength(1);
  });

  it("reads a negative or huge address as a number, for the validation to refuse", () => {
    expect(parseIoList(file("a.b.c;v;m1;coil;-1;BOOL;")).rows[0]?.address).toBe(-1);
    expect(parseIoList(file("a.b.c;v;m1;coil;70000;BOOL;")).rows[0]?.address).toBe(70000);
    expect(parseIoList(file("a.b.c;v;m1;coil;-0;BOOL;")).rows[0]?.address).toBe(0);
  });
});

describe("parseIoList line ends", () => {
  it("reads LF and CRLF files alike, with or without a final newline", () => {
    const lf = parseIoList(`${IO_LIST_HEADER}\n${ROW}\n`);
    expect(parseIoList(`${IO_LIST_HEADER}\r\n${ROW}\r\n`)).toEqual(lf);
    expect(parseIoList(`${IO_LIST_HEADER}\n${ROW}`)).toEqual(lf);
    expect(parseIoList(`${IO_LIST_HEADER}\r\n${ROW}`)).toEqual(lf);
    expect(lf.problems).toEqual([]);
  });

  it("keeps a comment that ends with a space before a CRLF", () => {
    expect(parseIoList(`${IO_LIST_HEADER}\r\na.b.c;v;m1;coil;0;BOOL;x \r\n`).rows[0]?.comment).toBe(
      "x ",
    );
  });

  it("refuses a blank line, anywhere but the final newline", () => {
    expect(problemsOf(`${IO_LIST_HEADER}\n\n${ROW}\n`)).toEqual([
      { line: 2, column: 1, code: "blank_line" },
    ]);
    expect(problemsOf(`${IO_LIST_HEADER}\n${ROW}\n\n`)).toEqual([
      { line: 3, column: 1, code: "blank_line" },
    ]);
    expect(problemsOf(`${IO_LIST_HEADER}\r\n${ROW}\r\n\r\n`)).toEqual([
      { line: 3, column: 1, code: "blank_line" },
    ]);
  });

  it("refuses a carriage return that is not part of a CRLF", () => {
    expect(problemsOf(`${IO_LIST_HEADER}\na.b.c;v;m1;co\ril;0;BOOL;\n`)).toEqual([
      { line: 2, column: 14, code: "bare_carriage_return" },
    ]);
    expect(problemsOf(`${IO_LIST_HEADER}\n${ROW}\r`)).toEqual([
      { line: 2, column: ROW.length + 1, code: "bare_carriage_return" },
    ]);
  });
});

describe("parseIoList header", () => {
  it("refuses an empty file", () => {
    expect(problemsOf("")).toEqual([{ line: 1, column: 1, code: "bad_header" }]);
    expect(problemsOf("\n")).toEqual([{ line: 1, column: 1, code: "bad_header" }]);
  });

  it("refuses any other first line, at the first differing column, and reads no row", () => {
    const wrong = IO_LIST_HEADER.replace("variable", "Variable");
    const parsed = parseIoList(`${wrong}\n${ROW}\n`);
    expect(parsed.rows).toEqual([]);
    expect(parsed.problems).toMatchObject([{ line: 1, column: 5, code: "bad_header" }]);
    expect(problemsOf(`${IO_LIST_HEADER};extra\n`)).toEqual([
      { line: 1, column: IO_LIST_HEADER.length + 1, code: "bad_header" },
    ]);
    expect(problemsOf(` ${IO_LIST_HEADER}\n`)).toEqual([
      { line: 1, column: 1, code: "bad_header" },
    ]);
  });
});

describe("parseIoList fields", () => {
  it("refuses a row with too few fields at its end, too many at the extra separator", () => {
    expect(problemsOf(file("a.b.c;v;m1;coil;3;BOOL"))).toEqual([
      { line: 2, column: 23, code: "wrong_field_count" },
    ]);
    expect(problemsOf(file("a.b.c;v;m1;coil;3;BOOL;c;d"))).toEqual([
      { line: 2, column: 25, code: "wrong_field_count" },
    ]);
  });

  it("refuses a double quote at its column, since there is no quoting", () => {
    expect(problemsOf(file('a.b.c;v;m1;coil;3;BOOL;say "hi"'))).toEqual([
      { line: 2, column: 28, code: "quote_in_field" },
    ]);
    expect(problemsOf(file('"a.b.c";v;m1;coil;3;BOOL;'))).toEqual([
      { line: 2, column: 1, code: "quote_in_field" },
    ]);
  });

  it("refuses an unknown zone, type or a non decimal address, all in one row", () => {
    expect(problemsOf(file("a.b.c;v;m1;register;0x10;INT;"))).toEqual([
      { line: 2, column: 12, code: "invalid_zone" },
      { line: 2, column: 21, code: "invalid_address" },
      { line: 2, column: 26, code: "invalid_type" },
    ]);
    for (const address of ["", "1.5", "40001 ", "1e3", "+4", "1234567890"]) {
      expect(problemsOf(file(`a.b.c;v;m1;coil;${address};BOOL;`))[0]?.code).toBe("invalid_address");
    }
  });
});

describe("decodeIoList and the byte order mark", () => {
  it("decodes UTF-8, accents included", () => {
    expect(decodeIoList(new TextEncoder().encode("é;"))).toEqual({ text: "é;" });
  });

  it("refuses bytes that are not UTF-8", () => {
    expect(decodeIoList(Uint8Array.of(0xff, 0xfe, 0x41))).toMatchObject({
      problem: { line: 1, column: 1, code: "invalid_encoding" },
    });
  });

  it("refuses a byte order mark with its own problem, and still reads the rest", () => {
    const decoded = decodeIoList(new TextEncoder().encode(`﻿${file(ROW)}`));
    if ("problem" in decoded) {
      throw new Error("a BOM is valid UTF-8 and must reach the parser");
    }
    const parsed = parseIoList(decoded.text);
    expect(parsed.problems).toMatchObject([{ line: 1, column: 1, code: "byte_order_mark" }]);
    expect(parsed.rows).toHaveLength(1);
  });
});
