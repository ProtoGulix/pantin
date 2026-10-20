import type { ConsoleLineView } from "./console-view.ts";

// The console as a text file (ADR 0031): the lines as the panel shows them, in
// the language of the viewer, one per line, so that a trace can be pasted in a
// ticket or kept with the PLC program. The sentences are the ones of
// console-text.ts: nothing is worded twice.

const FIELD_SEPARATOR = "  ";

function lineText(line: ConsoleLineView): string {
  const fields = [line.time, line.levelLabel, line.sourceLabel, line.text];
  if (line.detail !== null) {
    fields.push(`(${line.detail})`);
  }
  if (line.repeat !== null) {
    fields.push(line.repeat);
  }
  return fields.filter((field) => field !== "").join(FIELD_SEPARATOR);
}

/** One line of text per console line, in order, ending with a line break; empty for no line. */
export function consoleExportText(lines: readonly ConsoleLineView[]): string {
  return lines.map((line) => `${lineText(line)}\n`).join("");
}

/** The download's name: the Pantin it comes from, so that two exports never look alike. */
export function consoleExportFileName(pantinId: string): string {
  return `console-${pantinId}.txt`;
}
