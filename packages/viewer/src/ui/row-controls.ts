import type { Translate } from "../i18n/translate.ts";
import { type PropertyRow, type RowEditor, rowFocusKey } from "../properties/property-rows.ts";
import { button, element } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { applyToggle } from "./row-actions.ts";

// The controls of the inspector's rows that are not text or select inputs:
// a toggle (a bit to force, a fault) and a numeric command.

type ToggleEditor = Extract<RowEditor, { input: "toggle" }>;
type NumberEditor = Extract<RowEditor, { input: "number" }>;

export function toggleControl(
  row: PropertyRow,
  editor: ToggleEditor,
  liveId: string | null,
  translate: Translate,
  intents: PanelIntents,
): HTMLElement {
  const toggle = button(
    translate(editor.on ? "drives.bit.on" : "drives.bit.off"),
    "button property-grid__toggle",
    () => applyToggle(editor.action, toggle.getAttribute("aria-pressed") === "true", intents),
  );
  // A fixed name for screen readers; On or Off is what aria-pressed says.
  toggle.setAttribute("aria-label", row.label);
  toggle.setAttribute("aria-pressed", String(editor.on));
  toggle.setAttribute("data-focus-key", `toggle-${row.id}`);
  if (liveId !== null) {
    toggle.setAttribute("data-live-id", liveId);
  }
  return toggle;
}

export function numberControl(
  row: PropertyRow,
  editor: NumberEditor,
  liveId: string | null,
  translate: Translate,
  intents: PanelIntents,
): HTMLElement {
  const input = element("input", {
    className: "text-input",
    attributes: {
      type: "text",
      "aria-label": translate("properties.editLabel", { property: row.label }),
      "data-focus-key": rowFocusKey(row.id),
      spellcheck: "false",
    },
  });
  const send = () => intents.writeFloatTag(editor.tag, input.value);
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      send();
    }
  });
  const shown = element("span", {
    className: "property-grid__live",
    attributes: liveId === null ? {} : { "data-live-id": liveId },
  });
  return element("span", { className: "property-grid__send" }, [
    input,
    button(translate("drives.send"), "button", send),
    shown,
  ]);
}
