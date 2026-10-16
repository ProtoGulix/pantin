import { WordOrderSchema } from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";
import { cellIdOf } from "../io/io-problems.ts";
import type { IoSelectedModule } from "../io/io-view-model.ts";
import { element } from "./dom.ts";
import { ioButton, settingField } from "./io-cells.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The settings of the selected module (ADR 0049 point 11). Every field is sent
// as typed: the core checks ranges and duplicates and answers 400 or 409.

function wordOrderSelect(
  selected: IoSelectedModule,
  translate: Translate,
  intents: PanelIntents,
  id: string,
): HTMLElement {
  const label = translate("io.settings.wordOrder");
  const select = element("select", {
    className: "select-input",
    attributes: { id, "aria-label": label, "data-focus-key": id },
  });
  for (const value of WordOrderSchema.options) {
    const option = element("option", {
      text: translate(`io.settings.wordOrder.${value}`),
      attributes: { value },
    });
    option.selected = value === selected.module.wordOrder;
    select.append(option);
  }
  select.addEventListener("change", () =>
    intents.editIoModule(selected.module.key, "wordOrder", select.value),
  );
  const caption = element("label", { className: "io-field__label", text: label });
  caption.htmlFor = id;
  return element("div", { className: "io-field" }, [caption, select]);
}

export function drawModuleSettings(
  selected: IoSelectedModule,
  translate: Translate,
  intents: PanelIntents,
  busy: boolean,
): HTMLElement {
  const { module, moduleIndex, problems } = selected;
  const cellId = (field: string) => cellIdOf({ moduleIndex, channelIndex: null, field });
  const field = (name: "key" | "port" | "unitId" | "watchdogMilliseconds") =>
    settingField(
      cellId(name),
      translate(`io.settings.${name}`),
      String(module[name]),
      problems.get(name),
      (text) => intents.editIoModule(module.key, name, text),
    );
  const remove = ioButton(
    translate("io.module.remove", { key: module.key }),
    "io-button io-button--danger",
    busy,
    `io-remove-module-${module.key}`,
    () => intents.removeIoModule(module.key),
  );
  return element("section", { className: "io-settings" }, [
    element("h2", { className: "io-view__title", text: translate("io.settings.title") }),
    element("div", { className: "io-settings__fields" }, [
      field("key"),
      field("port"),
      field("unitId"),
      wordOrderSelect(selected, translate, intents, cellId("wordOrder")),
      field("watchdogMilliseconds"),
    ]),
    remove,
  ]);
}
