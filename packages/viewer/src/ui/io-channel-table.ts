import type { Translate } from "../i18n/translate.ts";
import { cellIdOf } from "../io/io-problems.ts";
import type { IoChannelRow, IoModuleSection } from "../io/io-sections.ts";
import { element } from "./dom.ts";
import { inputCell, ioButton, readOnlyCell, tagCell } from "./io-cells.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The channel table of one module (ADR 0049 point 11, ADR 0064 point 14). The signal, the unit,
// the variable and the comment are in every module; the columns between the variable and the
// comment are the module's transport's. Variable, address and comment are edited in place.

function rowButton(
  label: string,
  title: string,
  [busy, key]: readonly [boolean, string],
  onClick: () => void,
): HTMLElement {
  const created = ioButton(label, "io-button io-button--small", busy, key, onClick);
  created.title = title;
  return created;
}

// "—" for a signal without unit would be mute: the cell says it in words for a screen reader and a tooltip.
function unitCell(id: string, row: IoChannelRow, translate: Translate): HTMLElement {
  const cell = readOnlyCell(id, translate(row.unitKey));
  if (row.unitKey === "io.unit.none") {
    cell.title = translate("io.unit.noneLabel");
    cell.setAttribute("aria-label", translate("io.unit.noneLabel"));
  }
  return cell;
}

interface RowContext {
  section: IoModuleSection;
  row: IoChannelRow;
  translate: Translate;
  intents: PanelIntents;
  busy: boolean;
  id: (field: string) => string;
  edit: (field: string, value: string) => HTMLElement;
}

function rowContext(
  section: IoModuleSection,
  row: IoChannelRow,
  translate: Translate,
  intents: PanelIntents,
  busy: boolean,
): RowContext {
  const { channel, moduleIndex, channelIndex, problems } = row;
  const id = (field: string) => cellIdOf({ moduleIndex, channelIndex, field });
  const columnName = (field: string) =>
    field === "variable" || field === "comment"
      ? translate(`io.column.${field}`)
      : (section.columns.find((column) => column.field === field)?.label ?? field);
  const edit = (field: string, value: string) =>
    inputCell(
      id(field),
      `${columnName(field)} ${channel.tag}`,
      value,
      problems.get(field),
      (text) => intents.editIoChannel(section.module.key, channel.tag, field, text),
      field === "variable" ? "io-cell--variable" : "",
    );
  return { section, row, translate, intents, busy, id, edit };
}

// The transport's own cells: typed in place where the transport allows it, derived otherwise.
function transportCells({ row, id, edit }: RowContext): HTMLElement[] {
  return row.cells.map((cell) =>
    cell.editable
      ? edit(cell.field, cell.text)
      : readOnlyCell(id(cell.field), cell.text, row.problems.get(cell.field), cell.long),
  );
}

function actionCell({ section, row, translate, intents, busy }: RowContext): HTMLElement {
  const moduleKey = section.module.key;
  const { tag } = row.channel;
  return element("td", { className: "io-cell io-cell--actions" }, [
    rowButton(
      translate("io.channel.reassign"),
      translate("io.channel.reassignTitle", { tag }),
      [busy, `io-reassign-${moduleKey}-${tag}`],
      () => intents.reassignIoChannel(moduleKey, tag),
    ),
    rowButton(
      translate("io.channel.remove"),
      translate("io.channel.removeTitle", { tag }),
      [busy, `io-remove-${moduleKey}-${tag}`],
      () => intents.unmapIoChannel(moduleKey, tag),
    ),
  ]);
}

function channelRow(context: RowContext): HTMLElement {
  const { row, translate, intents, id, edit } = context;
  const { channel, problems } = row;
  return element("tr", { className: "io-row" }, [
    tagCell(
      id("tag"),
      channel.tag,
      channel.owner,
      translate("io.tag.selectOwner", { tag: channel.tag }),
      problems.get("tag"),
      intents.selectIoOwner,
    ),
    unitCell(id("unit"), row, translate),
    edit("variable", channel.variable),
    ...transportCells(context),
    edit("comment", channel.comment),
    actionCell(context),
  ]);
}

function headCell(text: string): HTMLElement {
  return element("th", { className: "io-table__head", text, attributes: { scope: "col" } });
}

export function drawChannelTable(
  section: IoModuleSection,
  translate: Translate,
  intents: PanelIntents,
  busy: boolean,
): HTMLElement {
  if (section.rows.length === 0) {
    return element("p", { className: "io-view__note", text: translate("io.channels.none") });
  }
  const heads = [
    translate("io.column.tag"),
    translate("io.column.unit"),
    translate("io.column.variable"),
    ...section.columns.map((column) => column.label),
    translate("io.column.comment"),
    translate("io.column.actions"),
  ].map(headCell);
  const label = translate("io.channels.of", { key: section.module.key });
  return element("div", { className: "io-table-scroll" }, [
    element("table", { className: "io-table", attributes: { "aria-label": label } }, [
      element("thead", {}, [element("tr", {}, heads)]),
      element(
        "tbody",
        {},
        section.rows.map((row) => channelRow(rowContext(section, row, translate, intents, busy))),
      ),
    ]),
  ]);
}
