import type { ConsoleLineView, ConsoleView } from "../console/console-view.ts";
import type { Translate } from "../i18n/translate.ts";
import { glyphOfLevel } from "../theme/state-glyphs.ts";
import { element, iconButton } from "./dom.ts";
import { icon } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The pieces of the console panel (ADR 0031 point 5): its head with the level
// filters, the verbose toggle (ADR 0061) and the buttons, and one line.

function filterButtons(view: ConsoleView, t: Translate, intents: PanelIntents): HTMLElement {
  const buttons = view.filters.map((filter) => {
    const created = element("button", {
      className: `console__filter console__filter--${filter.level}${filter.pressed ? " is-pressed" : ""}`,
      attributes: {
        type: "button",
        "aria-pressed": String(filter.pressed),
        "data-focus-key": `console-filter-${filter.level}`,
      },
    });
    created.append(icon(glyphOfLevel(filter.level)), filter.label);
    created.addEventListener("click", () => intents.toggleConsoleLevel(filter.level));
    return created;
  });
  return element(
    "div",
    {
      className: "console__filters",
      attributes: { role: "group", "aria-label": t("console.filters") },
    },
    buttons,
  );
}

function verboseToggle(view: ConsoleView, intents: PanelIntents): HTMLElement {
  const created = element("button", {
    className: `button console__verbose${view.verbose.pressed ? " is-pressed" : ""}`,
    attributes: {
      type: "button",
      title: view.verbose.hint,
      "aria-pressed": String(view.verbose.pressed),
      "data-focus-key": "console-verbose",
    },
  });
  created.append(icon("trace"), view.verbose.label);
  created.addEventListener("click", () => intents.toggleConsoleVerbose());
  return created;
}

export function consoleHead(view: ConsoleView, t: Translate, intents: PanelIntents): HTMLElement {
  const clear = element("button", {
    className: "button",
    text: t("console.clear"),
    attributes: {
      type: "button",
      title: t("console.clearHint"),
      "data-focus-key": "console-clear",
    },
  });
  clear.disabled = !view.canClear;
  clear.addEventListener("click", () => intents.clearConsole());
  const exported = element("button", {
    className: "button",
    text: t("console.export"),
    attributes: {
      type: "button",
      title: t("console.exportHint"),
      "data-focus-key": "console-export",
    },
  });
  exported.disabled = !view.canExport;
  exported.addEventListener("click", () => intents.exportConsole());
  return element("div", { className: "console__head" }, [
    element("h2", { className: "console__title", text: t("console.title") }),
    filterButtons(view, t, intents),
    verboseToggle(view, intents),
    element("span", { className: "toolbar__spacer" }),
    exported,
    clear,
    iconButton("close", t("console.close"), intents.toggleConsole),
  ]);
}

export function lineElement(line: ConsoleLineView, intents: PanelIntents): HTMLElement {
  const created = element(
    "div",
    {
      className: `console-line console-line--${line.level}${line.activatable ? " is-activatable" : ""}`,
      attributes: {
        role: "listitem",
        tabindex: "-1",
        title: line.title,
        "data-line-key": line.key,
      },
    },
    [
      element("span", { className: "console-line__time", text: line.time }),
      element("span", { className: "console-line__level" }, [icon(glyphOfLevel(line.level))]),
      element("span", { className: "console-line__level-text", text: line.levelLabel }),
      element("span", { className: "console-line__source", text: line.sourceLabel }),
      element("span", { className: "console-line__text", text: line.text }),
      line.detail === null
        ? null
        : element("code", { className: "console-line__detail", text: line.detail }),
      line.repeat === null
        ? null
        : element("span", { className: "console-line__repeat", text: line.repeat }),
    ],
  );
  if (line.activatable) {
    created.addEventListener("click", () => intents.selectConsoleSource(line.source));
  }
  return created;
}
