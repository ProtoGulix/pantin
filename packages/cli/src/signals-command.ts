import { deriveSignals } from "@pantin/core";
import type { Signal } from "@pantin/protocol";
import { type CommandResult, done, refused } from "./command-result.ts";
import { readFolderDocument } from "./validate-folder.ts";

// `pantin signals <folder> [--json]` (ADR 0064 point 2): the signals of the
// saved pantin.json, the same list as GET .../signals, as a table or as JSON.

const HEADERS = ["NAME", "TYPE", "DIRECTION", "UNIT", "OWNER"];

function rowOf(signal: Signal): string[] {
  return [
    signal.name,
    signal.type,
    signal.direction,
    signal.unit,
    `${signal.owner.kind} ${signal.owner.name}`,
  ];
}

function table(signals: readonly Signal[]): string {
  const rows = [HEADERS, ...signals.map(rowOf)];
  const widths = HEADERS.map((_, column) =>
    Math.max(...rows.map((row) => (row[column] ?? "").length)),
  );
  return rows
    .map((row) =>
      row
        .map((cell, column) => cell.padEnd(widths[column] ?? 0))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

/** Parses the arguments: the folder, and whether JSON is asked; undefined when they are wrong. */
export function parseSignalsArguments(
  args: readonly string[],
): { folder: string; json: boolean } | undefined {
  const folders = args.filter((arg) => arg !== "--json");
  const [folder] = folders;
  if (folder === undefined || folders.length > 1 || args.length - folders.length > 1) {
    return undefined;
  }
  return { folder, json: args.includes("--json") };
}

export async function signalsCommand(folder: string, json: boolean): Promise<CommandResult> {
  const read = await readFolderDocument(folder);
  if ("problems" in read) {
    return refused(read.problems);
  }
  const signals = deriveSignals(read.document);
  return done(json ? JSON.stringify({ signals }, null, 2) : table(signals));
}
