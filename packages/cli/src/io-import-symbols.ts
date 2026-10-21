import {
  ApiError,
  applyVariableAssignments,
  describeIoProblem,
  ioTagsOf,
  previewSymbolImport,
  readFileUpTo,
  serializeIoDocument,
  writeTextAtomically,
} from "@pantin/core";
import {
  IO_JSON_FILE_NAME,
  type IoDocument,
  type PantinDocument,
  SYMBOL_FILE_MAX_BYTES,
  type SymbolImportPreview,
  type SymbolMatch,
} from "@pantin/protocol";
import { type CommandResult, refused } from "./command-result.ts";
import { readFolderIoReading } from "./io-folder.ts";
import type { ImportSymbolsArguments } from "./io-import-arguments.ts";
import { renderSymbolPreview } from "./io-import-text.ts";
import { readFolderDocument } from "./validate-folder.ts";

// `pantin io import-symbols <folder> <file>` (ADR 0064 point 13): prints what the symbol
// file would change in io.json, then with --apply writes the compatible proposals (the
// warnings too with --accept-warnings) to a version 2 io.json. The matching is the core's.

const CAUTION =
  "note: like any tool that writes the folder, run this on a Pantin that no core holds open with unsaved edits; a core that has it open sees the change after discard or reopen.";

async function readSymbolFile(file: string): Promise<string | string[]> {
  let bytes: Uint8Array | undefined;
  try {
    bytes = await readFileUpTo(file, SYMBOL_FILE_MAX_BYTES);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return [`Cannot read ${file} (${reason}).`];
  }
  if (bytes === undefined) {
    return [`${file} does not exist.`];
  }
  if (bytes.length > SYMBOL_FILE_MAX_BYTES) {
    return [
      `${file} is larger than ${SYMBOL_FILE_MAX_BYTES} bytes: select fewer variables in the PLC software.`,
    ];
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return [`${file} is not valid UTF-8: save the symbol file as UTF-8.`];
  }
}

async function readMapping(folder: string): Promise<IoDocument | string[]> {
  const { reading } = await readFolderIoReading(folder);
  if (reading.kind === "missing") {
    return [`No ${IO_JSON_FILE_NAME} in this folder: run "pantin io init <folder>" first.`];
  }
  if (reading.kind === "unreadable") {
    return [`${IO_JSON_FILE_NAME} cannot be used:`, ...reading.problems.map(describeIoProblem)];
  }
  return reading.document;
}

function previewOf(
  text: string,
  format: string | undefined,
  mapping: IoDocument,
  document: PantinDocument,
): SymbolImportPreview | string[] {
  try {
    return previewSymbolImport(text, format, mapping, ioTagsOf(document));
  } catch (error) {
    if (error instanceof ApiError) {
      return [error.message];
    }
    throw error;
  }
}

function chosenProposals(preview: SymbolImportPreview, acceptWarnings: boolean): SymbolMatch[] {
  return preview.proposals.filter(
    (match) =>
      match.compatibility === "compatible" || (acceptWarnings && match.compatibility === "warning"),
  );
}

async function applyPreview(
  folder: string,
  mapping: IoDocument,
  preview: SymbolImportPreview,
  options: ImportSymbolsArguments,
): Promise<CommandResult> {
  const chosen = chosenProposals(preview, options.acceptWarnings);
  const outcome = applyVariableAssignments(
    mapping,
    chosen.map(({ module, tag, proposedVariable }) => ({
      module,
      tag,
      variable: proposedVariable,
    })),
  );
  if (outcome.applied.length > 0) {
    await writeTextAtomically(folder, IO_JSON_FILE_NAME, serializeIoDocument(outcome.document));
  }
  const left = preview.proposals.length - outcome.applied.length;
  return {
    exitCode: outcome.skipped.length === 0 ? 0 : 1,
    messages: [
      "",
      `Applied ${outcome.applied.length} variable(s) to ${IO_JSON_FILE_NAME}; ${left} proposal(s) not applied${options.acceptWarnings ? "" : " (use --accept-warnings for those to check)"}.`,
      CAUTION,
    ],
    errors: outcome.skipped.map(
      (entry) => `Skipped [${entry.module}] ${entry.tag} -> ${entry.variable}: ${entry.reason}`,
    ),
  };
}

export async function importSymbols(options: ImportSymbolsArguments): Promise<CommandResult> {
  const read = await readFolderDocument(options.folder);
  if ("problems" in read) {
    return refused(read.problems);
  }
  const mapping = await readMapping(options.folder);
  if (Array.isArray(mapping)) {
    return refused(mapping);
  }
  const text = await readSymbolFile(options.file);
  if (typeof text !== "string") {
    return refused(text);
  }
  const preview = previewOf(text, options.format, mapping, read.document);
  if (Array.isArray(preview)) {
    return refused(preview);
  }
  if (!options.apply) {
    return { exitCode: 0, messages: [renderSymbolPreview(preview)], errors: [] };
  }
  const applied = await applyPreview(options.folder, mapping, preview, options);
  return { ...applied, messages: [renderSymbolPreview(preview), ...applied.messages] };
}
