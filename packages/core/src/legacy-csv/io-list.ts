import { type IoType, IoTypeSchema, type IoZone, IoZoneSchema } from "@pantin/protocol";
import { IO_LIST_HEADER, type LegacyIoProblemCode } from "./legacy-types.ts";

// The strict parser of io.csv (ADR 0045 point 6): text in, rows or problems
// out, no CSV library. The format has no quoting and no escapes, so a field
// never contains ";", a double quote or a line break; fields are never
// trimmed; blank lines are refused except one final newline; every row has
// exactly 7 fields. Lines end with LF or CRLF.
//
// Encoding: UTF-8, and a byte order mark is refused with its own problem
// instead of being skipped (decided in slice P2, the ADR leaves it open). The
// format trims nothing, and a BOM that Excel adds to "CSV UTF-8" would
// otherwise make the first line fail with a message that shows nothing wrong.

type IoListColumn = "tag" | "variable" | "module" | "zone" | "address" | "type";

export type IoListRow = {
  // 1-based line of the row in the file.
  line: number;
  tag: string;
  variable: string;
  module: string;
  zone: IoZone;
  address: number;
  ioType: IoType;
  comment: string;
  // 1-based column where each field starts, for problems found later.
  columns: Record<IoListColumn, number>;
};

export type IoListProblem = {
  line: number;
  column: number;
  code: LegacyIoProblemCode;
  message: string;
};

export type IoListParse = { rows: IoListRow[]; problems: IoListProblem[] };

const FIELD_COUNT = 7;
const BYTE_ORDER_MARK = "﻿";
const ADDRESS_PATTERN = /^-?[0-9]{1,9}$/;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Decodes the file as UTF-8, keeping a byte order mark visible to the parser. */
export function decodeIoList(bytes: Uint8Array): { text: string } | { problem: IoListProblem } {
  try {
    return { text: UTF8_DECODER.decode(bytes) };
  } catch {
    return {
      problem: {
        line: 1,
        column: 1,
        code: "invalid_encoding",
        message: "The file is not valid UTF-8. Save it as UTF-8 without a byte order mark.",
      },
    };
  }
}

type Line = { text: string; number: number };

// A CR is dropped only when it ends a terminated line (CRLF); any other CR
// stays in the text and is reported by the row check.
function splitLines(text: string): Line[] {
  const parts = text.split("\n");
  const unterminated = parts.pop() ?? "";
  const lines = parts.map((part) => (part.endsWith("\r") ? part.slice(0, -1) : part));
  if (unterminated !== "") {
    lines.push(unterminated);
  }
  return lines.map((lineText, index) => ({ text: lineText, number: index + 1 }));
}

function problem(line: number, column: number, code: LegacyIoProblemCode, message: string) {
  return { line, column, code, message };
}

function headerProblem(line: Line): IoListProblem | null {
  if (line.text === IO_LIST_HEADER) {
    return null;
  }
  let common = 0;
  while (common < line.text.length && line.text[common] === IO_LIST_HEADER[common]) {
    common += 1;
  }
  return problem(
    1,
    common + 1,
    "bad_header",
    `The first line must be exactly "${IO_LIST_HEADER}" (it is the version of the format).`,
  );
}

type Field = { text: string; column: number };

function fieldsOf(text: string): Field[] {
  let column = 1;
  return text.split(";").map((fieldText) => {
    const field = { text: fieldText, column };
    column += fieldText.length + 1;
    return field;
  });
}

function characterProblem(line: Line, fields: readonly Field[]): IoListProblem | null {
  const carriageReturn = line.text.indexOf("\r");
  if (carriageReturn >= 0) {
    return problem(
      line.number,
      carriageReturn + 1,
      "bare_carriage_return",
      "A carriage return must be followed by a line feed (CRLF line ends).",
    );
  }
  for (const field of fields) {
    const quote = field.text.indexOf('"');
    if (quote >= 0) {
      return problem(
        line.number,
        field.column + quote,
        "quote_in_field",
        "A field never contains a double quote: the format has no quoting.",
      );
    }
  }
  return null;
}

function fieldCountProblem(line: Line, fields: readonly Field[]): IoListProblem | null {
  if (fields.length === FIELD_COUNT) {
    return null;
  }
  const column =
    fields.length < FIELD_COUNT ? line.text.length + 1 : (fields[FIELD_COUNT]?.column ?? 1) - 1;
  return problem(
    line.number,
    column,
    "wrong_field_count",
    `A row has exactly ${FIELD_COUNT} fields separated by ";", found ${fields.length}.`,
  );
}

// The seven fields of a row, once the field count is known to be right.
type RowFields = [Field, Field, Field, Field, Field, Field, Field];

function vocabularyProblems(line: Line, fields: RowFields): IoListProblem[] {
  const [, , , zone, address, type] = fields;
  const problems: IoListProblem[] = [];
  if (!IoZoneSchema.safeParse(zone.text).success) {
    const message = `Zone "${zone.text}" is not one of ${IoZoneSchema.options.join(", ")}.`;
    problems.push(problem(line.number, zone.column, "invalid_zone", message));
  }
  if (!ADDRESS_PATTERN.test(address.text)) {
    const message = `Address "${address.text}" is not a whole decimal number (0-based protocol address).`;
    problems.push(problem(line.number, address.column, "invalid_address", message));
  }
  if (!IoTypeSchema.safeParse(type.text).success) {
    const message = `Type "${type.text}" is not one of ${IoTypeSchema.options.join(", ")}.`;
    problems.push(problem(line.number, type.column, "invalid_type", message));
  }
  return problems;
}

// Only the closed vocabulary is checked here (zone, type, a whole number);
// what the values mean against the document is io-validation's job.
function rowOf(line: Line, fields: RowFields): IoListRow | IoListProblem[] {
  const problems = vocabularyProblems(line, fields);
  const [tag, variable, module, zone, address, type, comment] = fields;
  const parsedZone = IoZoneSchema.safeParse(zone.text);
  const parsedType = IoTypeSchema.safeParse(type.text);
  if (problems.length > 0 || !parsedZone.success || !parsedType.success) {
    return problems;
  }
  return {
    line: line.number,
    tag: tag.text,
    variable: variable.text,
    module: module.text,
    zone: parsedZone.data,
    // + 0 turns "-0" into 0.
    address: Number.parseInt(address.text, 10) + 0,
    ioType: parsedType.data,
    comment: comment.text,
    columns: {
      tag: tag.column,
      variable: variable.column,
      module: module.column,
      zone: zone.column,
      address: address.column,
      type: type.column,
    },
  };
}

// Cast: only called once fieldCountProblem found nothing, so there are seven.
function asRowFields(fields: readonly Field[]): RowFields {
  return fields as RowFields;
}

function parseRow(line: Line): IoListRow | IoListProblem[] {
  if (line.text === "") {
    return [problem(line.number, 1, "blank_line", "Blank lines are refused: remove it.")];
  }
  const fields = fieldsOf(line.text);
  const found = characterProblem(line, fields) ?? fieldCountProblem(line, fields);
  return found === null ? rowOf(line, asRowFields(fields)) : [found];
}

/** Parses the text of io.csv: every row that is well formed, and every problem found. */
export function parseIoList(text: string): IoListParse {
  const problems: IoListProblem[] = [];
  let content = text;
  if (content.startsWith(BYTE_ORDER_MARK)) {
    problems.push(
      problem(
        1,
        1,
        "byte_order_mark",
        "The file starts with a UTF-8 byte order mark: save it as UTF-8 without BOM.",
      ),
    );
    content = content.slice(BYTE_ORDER_MARK.length);
  }
  const [first, ...rest] = splitLines(content);
  const badHeader =
    first === undefined
      ? problem(
          1,
          1,
          "bad_header",
          `The file is empty: the first line must be exactly "${IO_LIST_HEADER}".`,
        )
      : headerProblem(first);
  if (badHeader !== null) {
    return { rows: [], problems: [...problems, badHeader] };
  }
  const rows: IoListRow[] = [];
  for (const line of rest) {
    const parsed = parseRow(line);
    if (Array.isArray(parsed)) {
      problems.push(...parsed);
    } else {
      rows.push(parsed);
    }
  }
  return { rows, problems };
}
