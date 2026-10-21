import type { Translate } from "../i18n/translate.ts";
import { cellIdOf } from "../io/io-problems.ts";
import type { IoModuleSection } from "../io/io-sections.ts";
import type { IoSettingView } from "../io/io-transport-view.ts";
import { element } from "./dom.ts";
import { ioButton, settingField } from "./io-cells.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The settings of a module (ADR 0049 point 11, ADR 0064 point 14). The fields and their words are
// the transport's; every value is sent as typed: the core checks ranges and duplicates and
// answers 400 or 409.

function choiceField(
  setting: IoSettingView,
  id: string,
  onCommit: (text: string) => void,
): HTMLElement {
  const select = element("select", {
    className: "select-input",
    attributes: { id, "aria-label": setting.label, "data-focus-key": id },
  });
  for (const choice of setting.options) {
    const option = element("option", { text: choice.label, attributes: { value: choice.value } });
    option.selected = choice.value === setting.value;
    select.append(option);
  }
  select.addEventListener("change", () => onCommit(select.value));
  const caption = element("label", { className: "io-field__label", text: setting.label });
  caption.htmlFor = id;
  return element("div", { className: "io-field" }, [caption, select]);
}

export function drawModuleSettings(
  section: IoModuleSection,
  translate: Translate,
  intents: PanelIntents,
  busy: boolean,
): HTMLElement {
  const { module, moduleIndex, problems } = section;
  const cellId = (field: string) => cellIdOf({ moduleIndex, channelIndex: null, field });
  const commit = (field: string) => (text: string) => intents.editIoModule(module.key, field, text);
  const key = settingField(
    cellId("key"),
    translate("io.settings.key"),
    module.key,
    problems.get("key"),
    commit("key"),
  );
  const fields = section.settings.map((setting) =>
    setting.input === "choice"
      ? choiceField(setting, cellId(setting.name), commit(setting.name))
      : settingField(
          cellId(setting.name),
          setting.label,
          setting.value,
          problems.get(setting.name),
          commit(setting.name),
        ),
  );
  const remove = ioButton(
    translate("io.module.remove", { key: module.key }),
    "io-button io-button--danger",
    busy,
    `io-remove-module-${module.key}`,
    () => intents.removeIoModule(module.key),
  );
  return element("div", { className: "io-settings" }, [
    element("div", { className: "io-settings__fields" }, [key, ...fields]),
    remove,
  ]);
}
