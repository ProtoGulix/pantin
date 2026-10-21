import type { BridgeStatus, IoMappingModule, IoProblemCode } from "@pantin/protocol";
import {
  MODULE_CONNECTION_KEYS,
  type ModuleConnection,
  moduleConnection,
} from "../bridge/module-connection.ts";
import { type Language, type MessageKey, pluralKey } from "../i18n/translate.ts";
import { ioCsvExportOf } from "./io-csv-export.ts";
import { type IoFileExport, ioGvlExportOf } from "./io-gvl-export.ts";
import { cellIdOf, cellOfPath, moduleIndexOfPath, problemCountByModule } from "./io-problems.ts";
import { type IoModuleSection, sectionsOf } from "./io-sections.ts";
import { effectiveModuleKey, type IoFocusRequest, type IoState } from "./io-state.ts";
import { creatableKinds, type IoKindChoice, moduleSubtitle } from "./io-transport-view.ts";
import {
  groupUnmappedTags,
  mapAllTagNames,
  offeredTagsFor,
  type UnmappedGroup,
} from "./io-unmapped.ts";

// Display logic of the I/O view (ADR 0049 point 11), as plain data. The viewer
// computes nothing: zone, type, address and variable are the core's.

// Problems that say the file could not be used: nothing is edited then, and
// the core would answer 409 to any mutation (ADR 0049 point 6).
const BLOCKING_CODES: ReadonlySet<IoProblemCode> = new Set([
  "file_too_large",
  "invalid_encoding",
  "invalid_json",
  "unreadable_file",
  "schema_invalid",
  "newer_schema_version",
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
  // The transport's name and endpoint, in the user's language.
  subtitle: string;
  channelCount: number;
  problemCount: number;
  selected: boolean;
  // From the bridge status: the list shows it as a dot.
  connection: ModuleConnection;
  // The status word written next to the glyph: a tooltip alone is not a cue.
  statusKey: MessageKey;
  // Singular or plural wording of the counts, by the language's own rule.
  channelsKey: MessageKey;
  problemsKey: MessageKey;
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
  gvl: IoFileExport;
  csv: IoFileExport;
  // The last refresh failed: the table shown may be out of date.
  outOfDate: boolean;
  problems: readonly IoProblemItem[];
  modules: readonly IoModuleItem[];
  // One section per module, in the file's order.
  sections: readonly IoModuleSection[];
  // What the selected module can take: tags no module maps, and feedbacks of other modules.
  unmapped: readonly UnmappedGroup[];
  // What "Map all" sends to the selected module.
  mapAllTags: readonly string[];
  // Offered when a module is created; the choice is hidden while there is only one.
  creatableKinds: readonly IoKindChoice[];
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

function moduleItemOf(
  module: IoMappingModule,
  problemCount: number,
  selected: boolean,
  bridgeStatus: BridgeStatus | null,
  language: Language,
): IoModuleItem {
  const connection = moduleConnection(bridgeStatus, module.key);
  return {
    key: module.key,
    subtitle: moduleSubtitle(module, language),
    channelCount: module.channels.length,
    problemCount,
    selected,
    connection,
    statusKey: MODULE_CONNECTION_KEYS[connection],
    channelsKey: pluralKey("io.module.channels", module.channels.length, language),
    problemsKey: pluralKey("io.module.problems", problemCount, language),
  };
}

export function buildIoView(
  state: IoState,
  assemblyNames: ReadonlyMap<string, string>,
  language: Language,
  busy = false,
  bridgeStatus: BridgeStatus | null = null,
): IoView {
  const mapping = state.mapping;
  const counts = problemCountByModule(mapping?.problems ?? []);
  const key = effectiveModuleKey(state);
  const unmapped =
    mapping === null ? [] : groupUnmappedTags(offeredTagsFor(mapping, key), assemblyNames);
  return {
    source: state,
    focus: state.focus,
    busy,
    mode: ioModeOf(state),
    gvl: ioGvlExportOf(state),
    csv: ioCsvExportOf(state),
    outOfDate: ioIsOutOfDate(state),
    problems: problemItems(state),
    modules: (mapping?.modules ?? []).map((module, index) =>
      moduleItemOf(module, counts.get(index) ?? 0, module.key === key, bridgeStatus, language),
    ),
    sections: sectionsOf(state, key, language),
    unmapped,
    mapAllTags: mapAllTagNames(unmapped),
    creatableKinds: creatableKinds(language),
    targetModuleKey: key,
  };
}
