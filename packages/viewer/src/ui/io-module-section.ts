import type { Translate } from "../i18n/translate.ts";
import type { IoModuleSection } from "../io/io-sections.ts";
import { button, element } from "./dom.ts";
import { drawChannelTable } from "./io-channel-table.ts";
import { drawModuleSettings } from "./io-module-form.ts";
import type { PanelIntents } from "./panel-intents.ts";

// One module of the I/O view (ADR 0064 point 14): its heading with the transport's subtitle, then
// its settings and its channels. The selected module is the one that "Map to" sends tags to: the
// section says so in words, and the others offer a button to become it.

function target(
  section: IoModuleSection,
  translate: Translate,
  intents: PanelIntents,
): HTMLElement {
  return section.selected
    ? element("span", { className: "io-section__target", text: translate("io.section.target") })
    : button(translate("io.section.choose"), "io-button io-button--small", () =>
        intents.selectIoModule(section.module.key),
      );
}

export function drawModuleSection(
  section: IoModuleSection,
  translate: Translate,
  intents: PanelIntents,
  busy: boolean,
): HTMLElement {
  const { key } = section.module;
  return element(
    "section",
    {
      className: `io-section${section.selected ? " is-selected" : ""}`,
      attributes: { "aria-label": translate("io.section.label", { key }) },
    },
    [
      element("header", { className: "io-section__header" }, [
        element("div", {}, [
          element("h2", { className: "io-view__title", text: key }),
          element("p", { className: "io-section__subtitle", text: section.subtitle }),
        ]),
        target(section, translate, intents),
      ]),
      drawModuleSettings(section, translate, intents, busy),
      drawChannelTable(section, translate, intents, busy),
    ],
  );
}
