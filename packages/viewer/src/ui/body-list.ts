import type { BodyRowView } from "../view-model.ts";
import { committingTextInput, element } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The original node names come from the CAD file and are never edited: they
// are shown read-only, in a monospace "source" style, apart from the display
// name so that the user always sees what a renamed body really is.
function sourceBlock(row: BodyRowView): HTMLElement {
  const nodes =
    row.sourceNodes.length === 0
      ? [element("li", { className: "source-node source-node--none", text: "(no node in file)" })]
      : row.sourceNodes.map((node) =>
          element(
            "li",
            { className: "source-node", attributes: { title: `Node path ${node.pathLabel}` } },
            [
              element("span", { className: "source-node__name", text: node.label }),
              element("span", { className: "source-node__path", text: node.pathLabel }),
            ],
          ),
        );
  return element("div", { className: "body-source" }, [
    element("div", { className: "body-source__label", text: `Source · ${row.sourceFileName}` }),
    element(
      "ul",
      { className: "source-node-list", attributes: { "aria-label": "Original node names" } },
      nodes,
    ),
  ]);
}

function frameBadges(row: BodyRowView): HTMLElement {
  return element("div", { className: "badges" }, [
    element("span", { className: "badge badge--format", text: row.sourceFormatLabel }),
    element("span", { className: "badge", text: row.unitLabel }),
    element("span", { className: "badge", text: row.upAxisLabel }),
  ]);
}

function bodyCard(row: BodyRowView, intents: PanelIntents): HTMLLIElement {
  const nameInput = committingTextInput(row.displayName, `Display name of body ${row.id}`, (name) =>
    intents.renameBody(row.id, name),
  );
  const card = element(
    "li",
    {
      className: row.isSelected ? "body-card body-card--selected" : "body-card",
      attributes: { "data-body-id": row.id },
    },
    [nameInput, frameBadges(row), sourceBlock(row)],
  );
  // Clicking anywhere on the card selects the body; the name input keeps focus.
  card.addEventListener("click", () => intents.selectBody(row.id));
  return card;
}

export function renderBodyList(rows: readonly BodyRowView[], intents: PanelIntents): HTMLElement {
  return element(
    "ul",
    { className: "body-list" },
    rows.map((row) => bodyCard(row, intents)),
  );
}

export function scrollSelectedBodyIntoView(container: HTMLElement): void {
  container.querySelector(".body-card--selected")?.scrollIntoView({ block: "nearest" });
}
