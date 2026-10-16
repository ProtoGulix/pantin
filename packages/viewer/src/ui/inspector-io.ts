import type { InspectorIoTag, InspectorIoView } from "../inspector/io-section.ts";
import { IO_SECTION_ID } from "../inspector/io-section.ts";
import { element } from "./dom.ts";
import { groupHeader } from "./group-header.ts";
import { icon } from "./icons.ts";
import { ioButton } from "./io-cells.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { statusDot } from "./status-dot.ts";

// The "E/S" / "I/O" section of the inspector (ADR 0049 point 11): a section of
// the properties grid like the others, one row per tag. Plain buttons, so that
// Tab and Enter reach every action; "Map" is disabled, with the reason as its
// tooltip, when nothing can receive the tag or a request waits.

// aria-disabled and a guard (ioButton), not `disabled`: the inspector is
// redrawn when a request starts and ends, and would drop the keyboard focus.
function textButton(
  [label, title]: readonly [string, string],
  [busy, focusKey]: readonly [boolean, string],
  onClick: () => void,
): HTMLButtonElement {
  const created = ioButton(label, "button", busy, focusKey, onClick);
  created.title = title;
  return created;
}

function openButton(tag: InspectorIoTag, view: InspectorIoView, intents: PanelIntents) {
  const created = element(
    "button",
    {
      className: "icon-button",
      attributes: {
        type: "button",
        title: view.openLabel,
        "aria-label": tag.openTitle ?? view.openLabel,
        "data-focus-key": `inspector-io-open-${tag.name}`,
      },
    },
    [icon("open")],
  );
  created.addEventListener("click", () => intents.showTagInIo(tag.name));
  return created;
}

function actionOf(tag: InspectorIoTag, view: InspectorIoView, intents: PanelIntents) {
  const { assign } = tag;
  if (assign !== null) {
    return textButton(
      [assign.label, assign.title],
      [view.busy || assign.moduleKey === null, `inspector-io-map-${tag.name}`],
      () => assign.moduleKey !== null && intents.mapIoTags(assign.moduleKey, [tag.name]),
    );
  }
  return tag.openTitle === null ? null : openButton(tag, view, intents);
}

function valueCell(tag: InspectorIoTag, action: HTMLElement | null): HTMLElement {
  const { connection } = tag;
  return element("td", { className: "property-grid__value inspector-io__value" }, [
    connection === null ? null : statusDot(connection.tone),
    connection === null
      ? null
      : element("span", { className: "visually-hidden", text: connection.text }),
    element("span", {
      className: tag.mapped ? "inspector-io__address" : "inspector-io__address is-unmapped",
      text: tag.status,
    }),
    element("span", { className: "inspector-io__action" }, [action]),
  ]);
}

function tagRow(tag: InspectorIoTag, view: InspectorIoView, intents: PanelIntents): HTMLElement {
  return element("tr", { attributes: { title: tag.title } }, [
    element("th", { className: "property-grid__name", attributes: { scope: "row" } }, [
      element("span", { text: tag.label }),
      element("span", { className: "visually-hidden", text: tag.title }),
    ]),
    valueCell(tag, actionOf(tag, view, intents)),
  ]);
}

function unavailableRow(view: InspectorIoView, intents: PanelIntents): HTMLElement | null {
  const { unavailable } = view;
  if (unavailable === null) {
    return null;
  }
  const retry = textButton(
    [unavailable.retryLabel, unavailable.text],
    [view.busy, "inspector-io-retry"],
    intents.retryIoMapping,
  );
  return element("tr", {}, [
    element("td", { className: "inspector-io__value", attributes: { colspan: "2" } }, [
      element("span", { className: "inspector-io__address is-unmapped", text: unavailable.text }),
      retry,
    ]),
  ]);
}

export function renderInspectorIo(view: InspectorIoView, intents: PanelIntents): HTMLElement {
  const header = groupHeader(
    { id: IO_SECTION_ID, title: view.title, collapsed: view.collapsed },
    intents,
  );
  const rows = view.collapsed
    ? []
    : [unavailableRow(view, intents), ...view.tags.map((tag) => tagRow(tag, view, intents))];
  return element("tbody", {}, [header, ...rows]);
}
