import type { Translate } from "../i18n/translate.ts";
import { cellIdOf } from "../io/io-problems.ts";
import type { IoChannelRow, IoSelectedModule } from "../io/io-view-model.ts";
import { element } from "./dom.ts";
import { inputCell, ioButton, readOnlyCell, tagCell } from "./io-cells.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The channel table of the selected module (ADR 0049 point 11). Variable,
// address and comment are edited in place; zone and type are the core's.

const COLUMN_HEADS = [
  "io.column.tag",
  "io.column.variable",
  "io.column.zone",
  "io.column.address",
  "io.column.ioType",
  "io.column.comment",
  "io.column.actions",
] as const;

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

function channelRow(
  row: IoChannelRow,
  translate: Translate,
  intents: PanelIntents,
  busy: boolean,
): HTMLElement {
  const { channel, moduleIndex, channelIndex, problems } = row;
  const id = (field: string) => cellIdOf({ moduleIndex, channelIndex, field });
  const edit = (field: "variable" | "address" | "comment", value: string) =>
    inputCell(
      id(field),
      `${translate(`io.column.${field}`)} ${channel.tag}`,
      value,
      problems.get(field),
      (text) => intents.editIoChannel(channel.tag, field, text),
      field === "variable" ? "io-cell--variable" : "",
    );
  return element("tr", { className: "io-row" }, [
    tagCell(
      id("tag"),
      channel.tag,
      channel.owner,
      translate("io.tag.selectOwner", { tag: channel.tag }),
      problems.get("tag"),
      intents.selectIoOwner,
    ),
    edit("variable", channel.variable),
    readOnlyCell(id("zone"), channel.zone, problems.get("zone")),
    edit("address", String(channel.address)),
    readOnlyCell(id("ioType"), channel.ioType, problems.get("ioType")),
    edit("comment", channel.comment),
    element("td", { className: "io-cell io-cell--actions" }, [
      rowButton(
        translate("io.channel.reassign"),
        translate("io.channel.reassignTitle", { tag: channel.tag }),
        [busy, `io-reassign-${channel.tag}`],
        () => intents.reassignIoChannel(channel.tag),
      ),
      rowButton(
        translate("io.channel.remove"),
        translate("io.channel.removeTitle", { tag: channel.tag }),
        [busy, `io-remove-${channel.tag}`],
        () => intents.unmapIoChannel(channel.tag),
      ),
    ]),
  ]);
}

export function drawChannelTable(
  selected: IoSelectedModule,
  translate: Translate,
  intents: PanelIntents,
  busy: boolean,
): HTMLElement {
  const title = translate("io.channels.title");
  if (selected.rows.length === 0) {
    return element("section", { className: "io-channels" }, [
      element("h2", { className: "io-view__title", text: title }),
      element("p", { className: "io-view__note", text: translate("io.channels.none") }),
    ]);
  }
  const heads = COLUMN_HEADS.map((column) =>
    element("th", {
      className: "io-table__head",
      text: translate(column),
      attributes: { scope: "col" },
    }),
  );
  return element("section", { className: "io-channels" }, [
    element("h2", { className: "io-view__title", text: title }),
    element("div", { className: "io-table-scroll" }, [
      element("table", { className: "io-table", attributes: { "aria-label": title } }, [
        element("thead", {}, [element("tr", {}, heads)]),
        element(
          "tbody",
          {},
          selected.rows.map((row) => channelRow(row, translate, intents, busy)),
        ),
      ]),
    ]),
  ]);
}
