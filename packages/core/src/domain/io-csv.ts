import type { IoMappingResponse } from "@pantin/protocol";
import { presentationOf } from "./io-transports.ts";

// The I/O mapping as a spreadsheet, one row per channel (ADR 0049 amendment of
// 2026-10-20, columns amended by ADR 0064): read-only, for review with an electrician or a wiring document.
// One renderer serves `pantin io export` and the GET .../io/csv route.
//
// Separator: a comma, with a UTF-8 byte order mark. Nothing in this repository
// documents the list separator of French Excel (it is a regional setting, and
// a semicolon is the usual French default, NOT VERIFIED here), so the format
// is the one RFC 4180 defines. The byte order mark is what makes Excel read
// the accents of a comment as UTF-8; other tools skip it.

type MappingModule = IoMappingResponse["modules"][number];

const BYTE_ORDER_MARK = "\uFEFF";
const LINE_BREAK = "\r\n";

// The text of the transport columns comes from the transport's presentation.
const IO_CSV_COLUMNS = [
  "module",
  "transport",
  "endpoint",
  "tag",
  "variable",
  "direction",
  "address",
  "plcType",
  "comment",
] as const;

// A comment that starts with one of these is read as a formula by spreadsheets,
// and typing "-B12" or "+A1-S2" (IEC 81346 designations) is common: it is
// written with a leading apostrophe, so that the spreadsheet shows text. Only
// the comment is free text: tags and variables are checked names, the other
// cells are numbers or fixed words.
const FORMULA_STARTS = ["=", "+", "-", "@", "\t", "\r"];

function asText(comment: string): string {
  return FORMULA_STARTS.some((start) => comment.startsWith(start)) ? `'${comment}` : comment;
}

function quoted(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

function moduleRows(module: MappingModule): string[][] {
  const presentation = presentationOf(module.transport);
  return module.channels.map((channel) => [
    module.key,
    presentation.transportText(module.transport),
    presentation.endpointText(module.transport),
    channel.tag,
    channel.variable,
    channel.direction ?? "",
    presentation.addressText(channel),
    presentation.plcTypeText(channel),
    asText(channel.comment),
  ]);
}

/** The CSV text for the modules of a valid mapping; a header row even when empty. */
export function renderIoCsv(modules: IoMappingResponse["modules"]): string {
  const rows = [[...IO_CSV_COLUMNS], ...modules.flatMap(moduleRows)];
  return (
    BYTE_ORDER_MARK + rows.map((row) => row.map(quoted).join(",")).join(LINE_BREAK) + LINE_BREAK
  );
}
