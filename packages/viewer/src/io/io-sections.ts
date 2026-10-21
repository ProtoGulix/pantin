import type { IoMappedChannel, IoMappingModule } from "@pantin/protocol";
import type { TransportKind } from "@pantin/transport-types/schemas";
import type { Language, MessageKey } from "../i18n/translate.ts";
import { cellIdOf, type IoCellRef, problemMessagesByCell } from "./io-problems.ts";
import type { IoState } from "./io-state.ts";
import {
  channelCells,
  channelColumns,
  type IoChannelCell,
  type IoColumnView,
  type IoSettingView,
  moduleSettings,
  moduleSubtitle,
} from "./io-transport-view.ts";

// One section per module in the I/O view (ADR 0064 point 14): a heading with its subtitle,
// the settings of its transport, and its channels. Plain data; the viewer works out nothing.

// Problem messages by key: a cell id for the whole mapping, a field name within one module or channel.
type ProblemMessages = ReadonlyMap<string, readonly string[]>;

export interface IoChannelRow {
  channel: IoMappedChannel;
  moduleIndex: number;
  channelIndex: number;
  // The unit comes from the signal list; a tag the document no longer has reads as unknown.
  unitKey: MessageKey;
  // The transport's own cells, under the transport's columns.
  cells: readonly IoChannelCell[];
  problems: ProblemMessages;
}

export interface IoModuleSection {
  module: IoMappingModule;
  moduleIndex: number;
  // The module that "Map to" sends tags to.
  selected: boolean;
  // "Modbus TCP esclave · Port 1502 · Adresse d'unité 1"
  subtitle: string;
  settings: readonly IoSettingView[];
  columns: readonly IoColumnView[];
  problems: ProblemMessages;
  rows: readonly IoChannelRow[];
}

function fieldProblems(
  byCell: ProblemMessages,
  moduleIndex: number,
  channelIndex: number | null,
  fields: readonly string[],
): ProblemMessages {
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

function rowOf(
  channel: IoMappedChannel,
  position: { kind: TransportKind; moduleIndex: number; channelIndex: number },
  units: IoState["units"],
  context: { language: Language; fields: readonly string[]; byCell: ProblemMessages },
): IoChannelRow {
  const { kind, moduleIndex, channelIndex } = position;
  return {
    channel,
    moduleIndex,
    channelIndex,
    unitKey: `io.unit.${units.get(channel.tag) ?? "unknown"}`,
    cells: channelCells(kind, channel, context.language),
    problems: fieldProblems(context.byCell, moduleIndex, channelIndex, context.fields),
  };
}

export function sectionsOf(
  state: IoState,
  selectedKey: string | null,
  language: Language,
): IoModuleSection[] {
  const mapping = state.mapping;
  if (mapping === null) {
    return [];
  }
  const byCell = problemMessagesByCell(mapping.problems);
  return mapping.modules.map((module, moduleIndex) => {
    const settings = moduleSettings(module, language);
    const columns = channelColumns(module.transport.kind, language);
    const channelFields = ["tag", "variable", "comment", ...columns.map((c) => c.field)];
    return {
      module,
      moduleIndex,
      selected: module.key === selectedKey,
      subtitle: moduleSubtitle(module, language),
      settings,
      columns,
      problems: fieldProblems(byCell, moduleIndex, null, [
        "key",
        ...settings.map((setting) => setting.name),
      ]),
      rows: module.channels.map((channel, channelIndex) =>
        rowOf(channel, { kind: module.transport.kind, moduleIndex, channelIndex }, state.units, {
          language,
          fields: channelFields,
          byCell,
        }),
      ),
    };
  });
}
