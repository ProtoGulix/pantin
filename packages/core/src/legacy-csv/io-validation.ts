import { MODBUS_MAX_ADDRESS, type TagDirection, type TagType } from "@pantin/protocol";
import { variableProblemOf } from "../domain/io-identifiers.ts";
import {
  BIT_ZONES,
  IO_TYPE_BY_TAG_TYPE,
  ioWidthOf,
  ZONES_BY_DIRECTION,
} from "../domain/io-rules.ts";
import type { IoListProblem, IoListRow } from "./io-list.ts";

// The rules of ADR 0045 point 7, against the open document's tag list (unsaved
// edits included): pure, from rows already parsed. Syntax problems come from
// io-list.ts. Unmapped tags are a warning, not a problem.

export type IoTag = { name: string; type: TagType; direction: TagDirection };

export type IoValidationInput = {
  rows: readonly IoListRow[];
  tags: readonly IoTag[];
  // Module keys of io-modules.json; null when that file is unusable, in which
  // case the module column cannot be checked.
  moduleKeys: ReadonlySet<string> | null;
};

export type IoValidation = { problems: IoListProblem[]; unmappedTags: string[] };

function found(
  row: IoListRow,
  column: keyof IoListRow["columns"],
  code: IoListProblem["code"],
  message: string,
): IoListProblem {
  return { line: row.line, column: row.columns[column], code, message };
}

function tagProblems(row: IoListRow, tag: IoTag | undefined): IoListProblem[] {
  if (tag === undefined) {
    return [
      found(
        row,
        "tag",
        "unknown_tag",
        `Tag "${row.tag}" does not exist in this Pantin. It may have been renamed: list the tags with GET /api/pantins/<id>/tags.`,
      ),
    ];
  }
  const problems: IoListProblem[] = [];
  if (!ZONES_BY_DIRECTION[tag.direction].includes(row.zone)) {
    const wanted = ZONES_BY_DIRECTION[tag.direction].join(" or ");
    problems.push(
      found(
        row,
        "zone",
        "zone_direction_mismatch",
        `Tag "${row.tag}" is a ${tag.direction}: its zone is ${wanted}, not ${row.zone}.`,
      ),
    );
  }
  if (row.ioType !== IO_TYPE_BY_TAG_TYPE[tag.type]) {
    problems.push(
      found(
        row,
        "type",
        "type_mismatch",
        `Tag "${row.tag}" is a ${tag.type}: its type is ${IO_TYPE_BY_TAG_TYPE[tag.type]}, not ${row.ioType}.`,
      ),
    );
  }
  return problems;
}

// BOOL lives in a bit zone, REAL and DINT in a register zone, whatever the tag.
function typeZoneProblem(row: IoListRow): IoListProblem[] {
  const inBitZone = BIT_ZONES.includes(row.zone);
  if ((row.ioType === "BOOL") === inBitZone) {
    return [];
  }
  const wanted =
    row.ioType === "BOOL" ? "a coil or a discrete input" : "a holding or an input register";
  return [
    found(
      row,
      "zone",
      "type_zone_mismatch",
      `A ${row.ioType} goes to ${wanted}, not to ${row.zone}.`,
    ),
  ];
}

function rangeProblem(row: IoListRow): IoListProblem[] {
  const last = row.address + ioWidthOf(row.ioType) - 1;
  if (row.address >= 0 && last <= MODBUS_MAX_ADDRESS) {
    return [];
  }
  return [
    found(
      row,
      "address",
      "address_out_of_range",
      `Address ${row.address} is out of 0..${MODBUS_MAX_ADDRESS} (a ${row.ioType} takes ${ioWidthOf(row.ioType)} ${row.ioType === "BOOL" ? "bit" : "registers"}, up to ${last}).`,
    ),
  ];
}

function rowProblems(row: IoListRow, input: IoValidationInput, tag: IoTag | undefined) {
  const problems = [...tagProblems(row, tag), ...typeZoneProblem(row), ...rangeProblem(row)];
  if (input.moduleKeys !== null && !input.moduleKeys.has(row.module)) {
    problems.push(
      found(row, "module", "unknown_module", `Module "${row.module}" is not in io-modules.json.`),
    );
  }
  const variable = variableProblemOf(row.variable);
  if (variable !== null) {
    problems.push(found(row, "variable", "invalid_variable", variable));
  }
  return problems;
}

// The second and later rows with the same key are the problem; the message
// names the first.
function duplicateProblems(
  rows: readonly IoListRow[],
  keyOf: (row: IoListRow) => string,
  column: "tag" | "variable",
  code: "duplicate_tag" | "duplicate_variable",
  describe: (row: IoListRow, firstLine: number) => string,
): IoListProblem[] {
  const firstLines = new Map<string, number>();
  const problems: IoListProblem[] = [];
  for (const row of rows) {
    const key = keyOf(row);
    const first = firstLines.get(key);
    if (first === undefined) {
      firstLines.set(key, row.line);
    } else {
      problems.push(found(row, column, code, describe(row, first)));
    }
  }
  return problems;
}

function overlapProblems(rows: readonly IoListRow[]): IoListProblem[] {
  const groups = new Map<string, IoListRow[]>();
  for (const row of rows.filter((candidate) => rangeProblem(candidate).length === 0)) {
    const key = `${row.module}\u0000${row.zone}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const problems: IoListProblem[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.address - b.address || a.line - b.line);
    let reaching: IoListRow | undefined;
    for (const row of sorted) {
      const reach = reaching === undefined ? 0 : reaching.address + ioWidthOf(reaching.ioType);
      if (reaching !== undefined && row.address < reach) {
        problems.push(
          found(
            row,
            "address",
            "address_overlap",
            `Address ${row.address} in module "${row.module}", zone ${row.zone}, overlaps line ${reaching.line} (${reaching.address}..${reach - 1}).`,
          ),
        );
      }
      if (reaching === undefined || row.address + ioWidthOf(row.ioType) > reach) {
        reaching = row;
      }
    }
  }
  return problems;
}

/** Checks the parsed rows against the document's tags; problems are sorted by position. */
export function validateIoRows(input: IoValidationInput): IoValidation {
  const tagsByName = new Map(input.tags.map((tag) => [tag.name, tag]));
  const problems = [
    ...input.rows.flatMap((row) => rowProblems(row, input, tagsByName.get(row.tag))),
    ...duplicateProblems(
      input.rows,
      (row) => row.tag,
      "tag",
      "duplicate_tag",
      (row, first) => `Tag "${row.tag}" is already mapped on line ${first}: a tag is mapped once.`,
    ),
    ...duplicateProblems(
      input.rows,
      (row) => row.variable.toLowerCase(),
      "variable",
      "duplicate_variable",
      (row, first) =>
        `Variable "${row.variable}" is already used on line ${first} (names are compared without case).`,
    ),
    ...overlapProblems(input.rows),
  ].sort((a, b) => a.line - b.line || a.column - b.column);
  const mapped = new Set(input.rows.map((row) => row.tag));
  const unmappedTags = input.tags.map((tag) => tag.name).filter((name) => !mapped.has(name));
  return { problems, unmappedTags };
}
