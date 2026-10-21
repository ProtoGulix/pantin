import type { Translate } from "../i18n/translate.ts";
import { unmappedEntryId } from "../io/io-element-tags.ts";
import type { IoOfferedTag } from "../io/io-unmapped.ts";
import type { IoView } from "../io/io-view-model.ts";
import { element } from "./dom.ts";
import { ioButton, tagLink } from "./io-cells.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The side list of unmapped tags, grouped by assembly (ADR 0049 point 11).
// Each one goes to the selected module; "Map all" sends them in one request.

function tagEntry(
  tag: IoOfferedTag,
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
  // The entry has the id a "Show in I/O" link lands on (io-element-tags.ts).
  return element(
    "li",
    {
      className: "io-unmapped__tag",
      attributes: { id: unmappedEntryId(tag.name), tabindex: "-1" },
    },
    [
      element("span", { className: "io-unmapped__name" }, [
        tagLink(
          tag.name,
          tag.owner,
          translate("io.tag.selectOwner", { tag: tag.name }),
          intents.selectIoOwner,
        ),
      ]),
      tag.alsoIn.length === 0
        ? null
        : element("span", {
            className: "io-unmapped__also",
            text: translate("io.unmapped.alsoIn", { modules: tag.alsoIn.join(", ") }),
          }),
      map,
    ],
  );
}

function mapAllButton(view: IoView, translate: Translate, intents: PanelIntents): HTMLElement {
  const target = view.targetModuleKey;
  const all = view.mapAllTags;
  const created = ioButton(
    translate("io.unmapped.mapAll"),
    "io-button",
    view.busy || target === null || all.length === 0,
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
  const target = view.targetModuleKey;
  const title =
    target === null
      ? translate("io.unmapped.titleNoModule", { count })
      : translate("io.unmapped.title", { count, module: target });
  return element("aside", { className: "io-unmapped", attributes: { "aria-label": title } }, [
    element("h2", { className: "io-view__title", text: title }),
    count === 0
      ? element("p", {
          className: "io-view__note",
          text: translate(target === null ? "io.unmapped.noneNoModule" : "io.unmapped.none"),
        })
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
