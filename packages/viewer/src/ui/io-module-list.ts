import { moduleConnectionTone } from "../bridge/module-connection.ts";
import type { Translate } from "../i18n/translate.ts";
import type { IoModuleItem, IoView } from "../io/io-view-model.ts";
import { element } from "./dom.ts";
import { ioButton } from "./io-cells.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { glyphThenText } from "./state-glyph.ts";
import { statusDot } from "./status-dot.ts";

// The module list on the left of the I/O view (ADR 0049 point 11).

function moduleRow(item: IoModuleItem, translate: Translate, intents: PanelIntents): HTMLElement {
  const status = translate(item.statusKey);
  const summary = translate("io.module.summary", {
    key: item.key,
    port: item.port,
    channels: item.channelCount,
    problems: item.problemCount,
  });
  const label = `${summary}, ${status}`;
  const choose = element(
    "button",
    {
      className: `io-module${item.selected ? " is-selected" : ""}`,
      attributes: {
        type: "button",
        "aria-pressed": String(item.selected),
        "aria-label": label,
        "data-focus-key": `io-module-${item.key}`,
      },
    },
    [
      element("span", { className: "io-module__connection" }, [
        statusDot(moduleConnectionTone(item.connection)),
        element("span", { className: "io-module__status", text: status }),
      ]),
      element("span", { className: "io-module__key", text: item.key }),
      element("span", { className: "io-module__port", text: `:${item.port}` }),
      element("span", {
        className: "io-module__count",
        text: translate("io.module.channels", { count: item.channelCount }),
      }),
      item.problemCount === 0
        ? null
        : element(
            "span",
            { className: "io-module__problems" },
            glyphThenText("error", translate("io.module.problems", { count: item.problemCount })),
          ),
    ],
  );
  choose.addEventListener("click", () => intents.selectIoModule(item.key));
  return element("li", {}, [choose]);
}

export function drawModuleList(
  view: IoView,
  translate: Translate,
  intents: PanelIntents,
): HTMLElement {
  const add = ioButton(
    translate("io.module.add"),
    "io-button",
    view.busy,
    "io-add-module",
    intents.addIoModule,
  );
  return element(
    "nav",
    { className: "io-modules", attributes: { "aria-label": translate("io.modules.title") } },
    [
      element("h2", { className: "io-view__title", text: translate("io.modules.title") }),
      view.modules.length === 0
        ? element("p", { className: "io-view__note", text: translate("io.modules.none") })
        : element(
            "ul",
            { className: "io-modules__list" },
            view.modules.map((item) => moduleRow(item, translate, intents)),
          ),
      add,
    ],
  );
}
