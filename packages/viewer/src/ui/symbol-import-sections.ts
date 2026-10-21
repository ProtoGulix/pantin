import type {
  SymbolPickerView,
  SymbolRowView,
  SymbolSectionView,
} from "../io/symbol-import-view.ts";
import { element } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { glyphThenText } from "./state-glyph.ts";

// The sections of the symbol import dialog (ADR 0064 point 14). A row to check begins with a
// triangle and says its remark in words: the tint is never the only cue (ADR 0057 rule 4).

type Intents = Pick<PanelIntents, "toggleSymbolRow" | "pickSymbol">;

function checkbox(row: SymbolRowView, intents: Intents): HTMLElement {
  const box = row.checkbox;
  const name = element("span", { className: "symbol-row__signal", text: row.signal });
  if (box === null) {
    return name;
  }
  const input = element("input", {
    attributes: { type: "checkbox", "aria-label": box.label, "data-focus-key": `row:${row.key}` },
  });
  input.checked = box.checked;
  input.addEventListener("change", () => intents.toggleSymbolRow(row.key));
  return element("label", { className: "symbol-row__check" }, [input, name]);
}

function picker(view: SymbolPickerView, rowKey: string, intents: Intents): HTMLElement {
  const select = element("select", {
    attributes: { "aria-label": view.label, "data-focus-key": `pick:${rowKey}` },
  });
  select.append(element("option", { text: view.emptyOption, attributes: { value: "" } }));
  for (const option of view.options) {
    select.append(element("option", { text: option.text, attributes: { value: option.value } }));
  }
  select.value = view.selected;
  select.disabled = view.options.length === 0;
  select.addEventListener("change", () => intents.pickSymbol(rowKey, select.value));
  return element("div", { className: "symbol-row__picker" }, [
    select,
    view.options.length === 0
      ? element("span", { className: "symbol-row__note", text: view.noOptionsText })
      : null,
  ]);
}

function rowItem(row: SymbolRowView, intents: Intents): HTMLElement {
  return element("li", { className: `symbol-row${row.tone === "warning" ? " is-warning" : ""}` }, [
    checkbox(row, intents),
    ...row.details.map((line) => element("span", { className: "symbol-row__detail", text: line })),
    ...row.remarks.map((remark) =>
      element(
        "span",
        { className: "symbol-row__remark" },
        row.tone === "warning"
          ? glyphThenText("warning", remark)
          : [document.createTextNode(remark)],
      ),
    ),
    row.picker === null ? null : picker(row.picker, row.key, intents),
  ]);
}

export function drawSymbolSection(section: SymbolSectionView, intents: Intents): HTMLElement {
  const headingId = `symbol-section-${section.id}`;
  return element(
    "section",
    { className: "symbol-section", attributes: { "aria-labelledby": headingId } },
    [
      element("h3", {
        className: "symbol-section__heading",
        text: section.heading,
        attributes: { id: headingId },
      }),
      section.rows.length === 0
        ? element("p", { className: "symbol-section__empty", text: section.emptyText })
        : element(
            "ul",
            { className: "symbol-section__rows" },
            section.rows.map((row) => rowItem(row, intents)),
          ),
    ],
  );
}
