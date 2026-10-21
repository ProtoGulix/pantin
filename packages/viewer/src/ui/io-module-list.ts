import type { TransportKind } from "@pantin/transport-types/schemas";
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
    subtitle: item.subtitle,
    channels: translate(item.channelsKey, { count: item.channelCount }),
    problems: translate(item.problemsKey, { count: item.problemCount }),
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
      element("span", {
        className: "io-module__count",
        text: translate(item.channelsKey, { count: item.channelCount }),
      }),
      item.problemCount === 0
        ? null
        : element(
            "span",
            { className: "io-module__problems" },
            glyphThenText("error", translate(item.problemsKey, { count: item.problemCount })),
          ),
    ],
  );
  choose.addEventListener("click", () => intents.selectIoModule(item.key));
  return element("li", {}, [choose]);
}

// The transport is asked for only when the registry has a choice: with one kind, the question has
// no answer but that one.
function kindChoice(view: IoView, translate: Translate): HTMLSelectElement | null {
  if (view.creatableKinds.length < 2) {
    return null;
  }
  const select = element("select", {
    className: "select-input",
    attributes: { "aria-label": translate("io.module.kind"), "data-focus-key": "io-module-kind" },
  });
  for (const choice of view.creatableKinds) {
    select.append(element("option", { text: choice.label, attributes: { value: choice.kind } }));
  }
  return select;
}

function chosenKind(view: IoView, select: HTMLSelectElement | null): TransportKind | undefined {
  return view.creatableKinds.find((choice) => choice.kind === select?.value)?.kind;
}

export function drawModuleList(
  view: IoView,
  translate: Translate,
  intents: PanelIntents,
): HTMLElement {
  const kindSelect = kindChoice(view, translate);
  const add = ioButton(translate("io.module.add"), "io-button", view.busy, "io-add-module", () =>
    intents.addIoModule(chosenKind(view, kindSelect)),
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
      kindSelect,
      add,
    ],
  );
}
