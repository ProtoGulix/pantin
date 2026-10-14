import type { IoMappedChannel, IoMappingModule, IoProblemCode } from "@pantin/protocol";
import { type IoGvlExport, ioGvlExportOf } from "./io-gvl-export.ts";
import {
  cellIdOf,
  cellOfPath,
  type IoCellRef,
  moduleIndexOfPath,
  problemCountByModule,
  problemMessagesByCell,
} from "./io-problems.ts";
import { effectiveModuleKey, type IoFocusRequest, type IoState } from "./io-state.ts";
import { groupUnmappedTags, type UnmappedGroup } from "./io-unmapped.ts";

// Display logic of the I/O view (ADR 0049 point 11), as plain data. The viewer
// computes nothing: zone, type, address and variable are the core's.

// Problems that say the file could not be used: nothing is edited then, and
// the core would answer 409 to any mutation (ADR 0049 points 6 and 8).
const BLOCKING_CODES: ReadonlySet<IoProblemCode> = new Set([
  "file_too_large",
  "invalid_encoding",
  "invalid_json",
  "unreadable_file",
  "schema_invalid",
  "legacy_io_files",
]);

// loading: no answer yet; failed: the read failed and nothing is known; missing: no io.json, "Create the mapping";
// unreadable: problems only, no edit; editing: modules and channels.
export type IoMode = "loading" | "failed" | "missing" | "unreadable" | "editing";

export interface IoProblemItem {
  message: string;
  // Null for a whole-file problem: listed at the top only.
  cellId: string | null;
  moduleKey: string | null;
}

export interface IoModuleItem {
  key: string;
  port: number;
  channelCount: number;
  problemCount: number;
  selected: boolean;
}

export interface IoChannelRow {
  channel: IoMappedChannel;
  moduleIndex: number;
  channelIndex: number;
  // Problem messages by column field.
  problems: ReadonlyMap<string, readonly string[]>;
}

export interface IoSelectedModule {
  module: IoMappingModule;
  moduleIndex: number;
  // Problem messages by setting field.
  problems: ReadonlyMap<string, readonly string[]>;
  rows: readonly IoChannelRow[];
}

export interface IoView {
  // The state this view was built from: the panel redraws only when it changes,
  // so that a pose or a clock event never takes the focus out of a cell.
  source: IoState;
  focus: IoFocusRequest | null;
  // A request is in flight: the buttons wait, so that a double click on Add
  // cannot create two modules.
  busy: boolean;
  mode: IoMode;
  gvl: IoGvlExport;
  // The last refresh failed: the table shown may be out of date.
  outOfDate: boolean;
  problems: readonly IoProblemItem[];
  modules: readonly IoModuleItem[];
  selected: IoSelectedModule | null;
  unmapped: readonly UnmappedGroup[];
  // Where "Map to" and "Map all" send the tags: the selected module.
  targetModuleKey: string | null;
}

export function ioModeOf(state: IoState): IoMode {
  const mapping = state.mapping;
  if (mapping === null) {
    return state.failedFor === null ? "loading" : "failed";
  }
  if (mapping.status === "missing") {
    return "missing";
  }
  const blocked = mapping.problems.some((problem) => BLOCKING_CODES.has(problem.code));
  return blocked || (mapping.status === "invalid" && mapping.modules.length === 0)
    ? "unreadable"
    : "editing";
}

/** A refresh failed after a mapping had been read: what is shown predates it. */
function ioIsOutOfDate(state: IoState): boolean {
  return state.mapping !== null && state.failedFor !== null && state.readFor !== state.failedFor;
}

function fieldProblems(
  byCell: ReadonlyMap<string, readonly string[]>,
  moduleIndex: number,
  channelIndex: number | null,
  fields: readonly string[],
): ReadonlyMap<string, readonly string[]> {
  const found = new Map<string, readonly string[]>();
  for (const field of fields) {
    const cell: IoCellRef = { moduleIndex, channelIndex, field };
    const messages = byCell.get(cellIdOf(cell));
    if (messages !== undefined) {
      found.set(field, messages);
    }
  }
  return found;
}

const MODULE_FIELDS = ["key", "port", "unitId", "wordOrder", "watchdogMilliseconds"];
const CHANNEL_FIELDS = ["tag", "variable", "zone", "address", "ioType", "comment"];

function selectedModuleOf(state: IoState): IoSelectedModule | null {
  const modules = state.mapping?.modules ?? [];
  const key = effectiveModuleKey(state);
  const moduleIndex = modules.findIndex((module) => module.key === key);
  const module = modules[moduleIndex];
  if (module === undefined || state.mapping === null) {
    return null;
  }
  const byCell = problemMessagesByCell(state.mapping.problems);
  return {
    module,
    moduleIndex,
    problems: fieldProblems(byCell, moduleIndex, null, MODULE_FIELDS),
    rows: module.channels.map((channel, channelIndex) => ({
      channel,
      moduleIndex,
      channelIndex,
      problems: fieldProblems(byCell, moduleIndex, channelIndex, CHANNEL_FIELDS),
    })),
  };
}

function problemItems(state: IoState): IoProblemItem[] {
  const mapping = state.mapping;
  return (mapping?.problems ?? []).map((problem) => {
    const cell = cellOfPath(problem.path);
    const moduleIndex = moduleIndexOfPath(problem.path);
    return {
      message: problem.message,
      cellId: cell === null ? null : cellIdOf(cell),
      moduleKey: moduleIndex === null ? null : (mapping?.modules[moduleIndex]?.key ?? null),
    };
  });
}

export function buildIoView(
  state: IoState,
  assemblyNames: ReadonlyMap<string, string>,
  busy = false,
): IoView {
  const mapping = state.mapping;
  const counts = problemCountByModule(mapping?.problems ?? []);
  const key = effectiveModuleKey(state);
  return {
    source: state,
    focus: state.focus,
    busy,
    mode: ioModeOf(state),
    gvl: ioGvlExportOf(state),
    outOfDate: ioIsOutOfDate(state),
    problems: problemItems(state),
    modules: (mapping?.modules ?? []).map((module, index) => ({
      key: module.key,
      port: module.port,
      channelCount: module.channels.length,
      problemCount: counts.get(index) ?? 0,
      selected: module.key === key,
    })),
    selected: selectedModuleOf(state),
    unmapped: groupUnmappedTags(mapping?.unmappedTags ?? [], assemblyNames),
    targetModuleKey: key,
  };
}
