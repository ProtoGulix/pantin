import type { IoUnmappedTag } from "@pantin/protocol";
import type { Translate } from "../i18n/translate.ts";
import type { IoView } from "../io/io-view-model.ts";
import { element } from "./dom.ts";
import { ioButton } from "./io-cells.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The side list of unmapped tags, grouped by assembly (ADR 0049 point 11).
// Each one goes to the selected module; "Map all" sends them in one request.

function tagEntry(
  tag: IoUnmappedTag,
  target: string | null,
  busy: boolean,
  translate: Translate,
  intents: PanelIntents,
): HTMLElement {
  const map = ioButton(
    translate("io.unmapped.mapTo", { module: target ?? "" }),
    "io-button io-button--small",
    busy || target === null,
    `io-map-${tag.name}`,
    () => target !== null && intents.mapIoTags(target, [tag.name]),
  );
  map.title = translate("io.unmapped.mapToTitle", { tag: tag.name, module: target ?? "" });
  return element("li", { className: "io-unmapped__tag" }, [
    element("span", { className: "io-unmapped__name", text: tag.name }),
    map,
  ]);
}

function mapAllButton(view: IoView, translate: Translate, intents: PanelIntents): HTMLElement {
  const target = view.targetModuleKey;
  const all = view.unmapped.flatMap((group) => group.tags.map((tag) => tag.name));
  const created = ioButton(
    translate("io.unmapped.mapAll"),
    "io-button",
    view.busy || target === null,
    "io-map-all",
    () => target !== null && intents.mapIoTags(target, all),
  );
  created.title = translate("io.unmapped.mapAllTitle", { module: target ?? "" });
  return created;
}

export function drawUnmappedList(
  view: IoView,
  translate: Translate,
  intents: PanelIntents,
): HTMLElement {
  const count = view.unmapped.reduce((total, group) => total + group.tags.length, 0);
  const title = translate("io.unmapped.title", { count });
  const target = view.targetModuleKey;
  return element("aside", { className: "io-unmapped", attributes: { "aria-label": title } }, [
    element("h2", { className: "io-view__title", text: title }),
    count === 0
      ? element("p", { className: "io-view__note", text: translate("io.unmapped.none") })
      : mapAllButton(view, translate, intents),
    target === null
      ? element("p", { className: "io-view__note", text: translate("io.unmapped.noModule") })
      : null,
    ...view.unmapped.map((group) =>
      element("section", { className: "io-unmapped__group" }, [
        element("h3", { className: "io-unmapped__assembly", text: group.assemblyName }),
        element(
          "ul",
          { className: "io-unmapped__list" },
          group.tags.map((tag) => tagEntry(tag, target, view.busy, translate, intents)),
        ),
      ]),
    ),
  ]);
}
