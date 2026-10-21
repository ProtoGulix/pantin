import type { Language, MessageKey, Translate } from "../i18n/translate.ts";
import type { IoState } from "../io/io-state.ts";
import type { IoView } from "../io/io-view-model.ts";
import { element } from "./dom.ts";
import { captureFocus, restoreFocus } from "./focus.ts";
import { ioButton } from "./io-cells.ts";
import { drawModuleList } from "./io-module-list.ts";
import { drawModuleSection } from "./io-module-section.ts";
import { drawProblemList } from "./io-problem-list.ts";
import { drawUnmappedList } from "./io-unmapped-list.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { markAsZoneView } from "./zone-view.ts";

// The I/O view in the central area (ADR 0049 point 11, ADR 0064 point 14): modules on the left,
// one section per module in the middle, what the selected module can take on the right,
// problems at the top. It is redrawn only when the mapping or the selection
// changes, so that typing in a cell is never interrupted by something else.

function statusPage(view: IoView, translate: Translate, intents: PanelIntents): HTMLElement[] {
  if (view.mode === "loading") {
    return [element("p", { className: "io-view__note", text: translate("io.loading") })];
  }
  if (view.mode === "failed") {
    return [
      element("p", { className: "io-view__note", text: translate("io.failed") }),
      ioButton(translate("io.retry"), "io-button", view.busy, "io-retry", intents.retryIoMapping),
    ];
  }
  if (view.mode === "missing") {
    const create = ioButton(
      translate("io.missing.create"),
      "io-button",
      view.busy,
      "io-create",
      intents.addIoModule,
    );
    return [
      element("p", { className: "io-view__note", text: translate("io.missing.text") }),
      create,
    ];
  }
  return [element("p", { className: "io-view__note", text: translate("io.unreadable") })];
}

function editor(view: IoView, translate: Translate, intents: PanelIntents): HTMLElement {
  return element("div", { className: "io-view__body" }, [
    drawModuleList(view, translate, intents),
    element(
      "div",
      { className: "io-view__main" },
      view.sections.map((section) => drawModuleSection(section, translate, intents, view.busy)),
    ),
    drawUnmappedList(view, translate, intents),
  ]);
}

// aria-disabled, not `disabled`, so that the tooltip shows and the focus stays.
function exportButton(
  translate: Translate,
  exported: IoView["gvl"],
  labelKey: MessageKey,
  testId: string,
  intent: () => void,
): HTMLElement {
  const created = ioButton(translate(labelKey), "io-button", !exported.enabled, testId, intent);
  created.title = translate(exported.titleKey);
  return created;
}

function exportToolbar(view: IoView, translate: Translate, intents: PanelIntents): HTMLElement {
  return element("div", { className: "io-view__toolbar" }, [
    exportButton(translate, view.gvl, "io.gvl.export", "io-export-gvl", intents.exportIoGvl),
    exportButton(translate, view.csv, "io.csv.export", "io-export-csv", intents.exportIoCsv),
  ]);
}

function pageContent(view: IoView, translate: Translate, intents: PanelIntents): HTMLElement[] {
  const problems = drawProblemList(view, translate, intents);
  const stale = view.outOfDate
    ? [
        element("p", { className: "io-view__note", text: translate("io.outOfDate") }),
        ioButton(translate("io.retry"), "io-button", view.busy, "io-retry", intents.retryIoMapping),
      ]
    : [];
  const body =
    view.mode === "editing"
      ? [editor(view, translate, intents)]
      : statusPage(view, translate, intents);
  return [
    exportToolbar(view, translate, intents),
    ...stale,
    ...(problems === null ? [] : [problems]),
    ...body,
  ];
}

export class IoPanel {
  private readonly host = element("section", { className: "io-view" });
  private readonly content = element("div", { className: "io-view__content" });
  private shown: IoState | null = null;
  private shownLanguage: Language | null = null;
  private shownBusy = false;
  private shownConnections = "";
  private focusedSerial = 0;

  // Placed like the diagram: over the canvas, under the welcome overlay.
  constructor(viewport: HTMLElement, before: HTMLElement) {
    markAsZoneView(this.host, "io");
    this.host.hidden = true;
    this.host.append(this.content);
    viewport.insertBefore(this.host, before);
  }

  render(view: IoView | null, translate: Translate, language: Language, intents: PanelIntents) {
    this.host.hidden = view === null;
    if (view === null) {
      this.shown = null;
      return;
    }
    this.host.setAttribute("aria-label", translate("io.label"));
    const connections = view.modules.map((module) => module.connection).join();
    if (
      connections !== this.shownConnections ||
      view.source !== this.shown ||
      language !== this.shownLanguage ||
      view.busy !== this.shownBusy
    ) {
      const snapshot = captureFocus(this.content);
      this.content.replaceChildren(...pageContent(view, translate, intents));
      restoreFocus(this.content, snapshot);
      this.shown = view.source;
      this.shownLanguage = language;
      this.shownBusy = view.busy;
      this.shownConnections = connections;
    }
    this.focusRequestedCell(view);
  }

  // A problem was clicked: bring its cell into view and focus it, once.
  private focusRequestedCell(view: IoView): void {
    const request = view.focus;
    if (request === null || request.serial === this.focusedSerial) {
      return;
    }
    this.focusedSerial = request.serial;
    const target = this.host.querySelector<HTMLElement>(`[id="${request.cellId}"]`);
    target?.scrollIntoView({ block: "center" });
    target?.focus();
  }
}
