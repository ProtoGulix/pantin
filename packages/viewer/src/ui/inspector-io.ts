import type { InspectorIoTag, InspectorIoView } from "../inspector/io-section.ts";
import { element } from "./dom.ts";
import { ioButton } from "./io-cells.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The "E/S" / "I/O" section of the inspector (ADR 0049 point 11). Plain
// buttons, so that Tab and Enter reach every action; "Map" is disabled, with
// the reason as its tooltip, when nothing can receive the tag or a request waits.

// aria-disabled and a guard (ioButton), not `disabled`: the inspector is
// redrawn when a request starts and ends, and would drop the keyboard focus.
function actionButton(
  [label, title]: readonly [string, string],
  [busy, focusKey]: readonly [boolean, string],
  onClick: () => void,
): HTMLButtonElement {
  const created = ioButton(label, "button", busy, focusKey, onClick);
  created.title = title;
  return created;
}

function tagItem(tag: InspectorIoTag, view: InspectorIoView, intents: PanelIntents): HTMLElement {
  const { assign } = tag;
  const actions = [
    assign === null
      ? null
      : actionButton(
          [assign.label, assign.title],
          [view.busy || assign.moduleKey === null, `inspector-io-map-${tag.name}`],
          () => assign.moduleKey !== null && intents.mapIoTags(assign.moduleKey, [tag.name]),
        ),
    tag.openTitle === null
      ? null
      : actionButton(
          [view.openLabel, tag.openTitle],
          [false, `inspector-io-open-${tag.name}`],
          () => intents.showTagInIo(tag.name),
        ),
  ].filter((part) => part !== null);
  return element("li", { className: "inspector-io__tag" }, [
    element("span", { className: "inspector-io__name", text: tag.name }),
    element("span", {
      className: `inspector-io__status${tag.mapped ? "" : " is-unmapped"}`,
      text: tag.status,
    }),
    element("span", { className: "inspector-io__actions" }, actions),
  ]);
}

export function renderInspectorIo(view: InspectorIoView, intents: PanelIntents): HTMLElement {
  return element(
    "section",
    { className: "inspector-io", attributes: { "aria-label": view.title } },
    [
      element("h3", { className: "inspector__subject", text: view.title }),
      ...(view.unavailable === null
        ? []
        : [
            element("p", { className: "inspector__empty", text: view.unavailable.text }),
            actionButton(
              [view.unavailable.retryLabel, view.unavailable.text],
              [view.busy, "inspector-io-retry"],
              intents.retryIoMapping,
            ),
          ]),
      element(
        "ul",
        { className: "inspector-io__list" },
        view.tags.map((tag) => tagItem(tag, view, intents)),
      ),
    ],
  );
}
