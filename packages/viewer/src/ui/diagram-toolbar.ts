import { escapeClearsFilter, fieldTextToWrite } from "../diagram/diagram-filter-field.ts";
import type { DiagramModel } from "../diagram/diagram-view-model.ts";
import { element } from "./dom.ts";

// The bar over the chain diagram: the filter by name or tag, how many nodes
// match, and "Print". It is created once and kept by the view across redraws,
// so that the text field keeps its focus and its caret while the user types and
// the diagram is laid out again under it.

type ShownModel = Extract<DiagramModel, { shown: true }>;

export class DiagramToolbar {
  readonly root: HTMLElement;
  private readonly input = element("input", {
    className: "text-input diagram__filter",
    attributes: { type: "search", autocomplete: "off", spellcheck: "false" },
  });
  private readonly status = element("span", {
    className: "diagram__filter-status",
    attributes: { role: "status" },
  });
  private readonly printButton = element("button", {
    className: "button",
    attributes: { type: "button" },
  });

  constructor(onFilter: (text: string) => void, onPrint: () => void) {
    this.root = element("div", { className: "diagram__toolbar", attributes: { role: "search" } }, [
      this.input,
      this.status,
      element("span", { className: "toolbar__spacer" }),
      this.printButton,
    ]);
    this.input.addEventListener("input", () => onFilter(this.input.value));
    this.input.addEventListener("keydown", (event) => {
      // Escape clears a filter before anything else reacts to it.
      if (escapeClearsFilter(event.key, this.input.value)) {
        event.preventDefault();
        event.stopPropagation();
        this.input.value = "";
        onFilter("");
      }
    });
    this.printButton.addEventListener("click", onPrint);
  }

  show(model: ShownModel): void {
    const t = model.translate;
    this.root.setAttribute("aria-label", t("diagram.filter.group"));
    this.input.placeholder = t("diagram.filter.placeholder");
    this.input.setAttribute("aria-label", t("diagram.filter.label"));
    this.input.title = t("diagram.filter.label");
    const written = fieldTextToWrite(this.input.value, model.filter);
    if (written !== null) {
      this.input.value = written;
    }
    this.status.textContent =
      model.filter.trim() === "" ? "" : t("diagram.filter.count", { count: model.matches.size });
    this.printButton.textContent = t("diagram.print");
    this.printButton.title = t("diagram.printHint");
  }
}
