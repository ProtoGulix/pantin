import { type BridgeModuleLine, type BridgeView, bridgeRedrawKey } from "../bridge/bridge-view.ts";
import { moduleConnectionTone } from "../bridge/module-connection.ts";
import { button, committingTextInput, element, iconButton, selectInput } from "./dom.ts";
import { captureFocus, restoreFocus } from "./focus.ts";
import type { IconName } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { statusDot } from "./status-dot.ts";

// The bridge block at the bottom of the left side panel (ADR 0050 point 8), so
// that the PLC connection stays visible in every central layout. It is written
// in place when the view changes, never when it is identical: a status
// arrives with every PLC connection change, and a redraw would drop the focus.

function networkChoice(
  view: BridgeView,
  mode: "local" | "lan",
  text: string,
  intents: PanelIntents,
): HTMLElement {
  const radio = element("input", {
    attributes: {
      type: "radio",
      name: "bridge-network",
      value: mode,
      "data-focus-key": `bridge-network-${mode}`,
    },
  });
  radio.checked = view.mode === mode;
  radio.disabled = view.networkLocked;
  radio.addEventListener("change", () => intents.chooseBridgeNetwork(mode));
  return element("label", { className: "bridge-panel__choice" }, [
    radio,
    element("span", { text }),
  ]);
}

function lanFields(view: BridgeView, intents: PanelIntents): HTMLElement[] {
  if (!view.showLanFields) {
    return [];
  }
  const listen = selectInput(
    view.listenChoices.map((address) => ({ value: address, label: address })),
    view.listen,
    view.listenLabel,
    (address) => intents.chooseBridgeListen(address),
  );
  listen.disabled = view.networkLocked;
  listen.setAttribute("data-focus-key", "bridge-listen");
  const allow = committingTextInput(view.allowText, {
    label: view.allowLabel,
    focusKey: "bridge-allow",
    onCommit: (text) => intents.editBridgeAllow(text),
  });
  allow.className = "text-input bridge-panel__allow";
  allow.id = "bridge-allow";
  allow.placeholder = view.allowLabel;
  allow.title = view.allowLabel;
  allow.disabled = view.networkLocked;
  return [listen, allow];
}

const ACTION_ICONS = { start: "play", stop: "stop", restart: "restart" } as const;

// aria-disabled keeps the tooltip and the focus, like the other I/O buttons.
function toolButton(
  name: IconName,
  label: string,
  focusKey: string,
  onClick: () => void,
): HTMLButtonElement {
  const created = iconButton(name, label, onClick);
  created.classList.add("bridge-panel__tool");
  created.setAttribute("data-focus-key", focusKey);
  return created;
}

function actionButton(view: BridgeView, intents: PanelIntents): HTMLElement {
  const { kind, label, enabled } = view.button;
  const created = toolButton(ACTION_ICONS[kind], label, "bridge-action", () => {
    if (enabled) {
      if (kind === "stop") {
        intents.stopBridge();
      } else {
        intents.startBridge();
      }
    }
  });
  created.setAttribute("aria-disabled", String(!enabled));
  if (view.notice !== null) {
    created.title = view.notice;
  }
  return created;
}

function configureIoButton(view: BridgeView, intents: PanelIntents): HTMLElement {
  const created = toolButton("gear", view.configureIo.label, "bridge-configure-io", () =>
    intents.setCentralLayout("io"),
  );
  // The visible text names the button; the longer label stays as the tooltip.
  created.removeAttribute("aria-label");
  created.classList.add("bridge-panel__tool--text");
  created.append(element("span", { text: view.configureIo.text }));
  if (view.configureIo.active) {
    created.setAttribute("aria-current", "true");
  }
  return created;
}

// Text only: the log has no icon of its own, and the word is clearer than a guess.
function journalButton(view: BridgeView, intents: PanelIntents): HTMLElement {
  const created = button(
    view.journalButton.text,
    "icon-button bridge-panel__tool bridge-panel__tool--text",
    () => intents.openBridgeJournal(),
  );
  created.title = view.journalButton.label;
  created.setAttribute("data-focus-key", "bridge-journal");
  return created;
}

function moduleLine(line: BridgeModuleLine): HTMLElement {
  return element("li", { className: "bridge-panel__module" }, [
    statusDot(moduleConnectionTone(line.connection)),
    element("span", { className: "bridge-panel__module-key", text: line.key }),
    element("span", { className: "bridge-panel__module-address", text: line.address }),
    element("span", { className: "bridge-panel__module-status", text: line.statusText }),
  ]);
}

function modulesBlock(view: BridgeView): HTMLElement {
  if (view.noModuleText !== null) {
    return element("p", { className: "bridge-panel__hint", text: view.noModuleText });
  }
  return element("ul", { className: "bridge-panel__modules" }, view.moduleLines.map(moduleLine));
}

// A forced tag ignores the PLC's writes: said here, where the PLC is connected.
function forcedWarningBlock(view: BridgeView, intents: PanelIntents): HTMLElement | null {
  const { forcedWarning } = view;
  if (forcedWarning === null) {
    return null;
  }
  const release = button(forcedWarning.releaseLabel, "button", () => intents.releaseAllTags());
  release.title = forcedWarning.releaseHint;
  release.setAttribute("data-focus-key", "bridge-release-all");
  return element("div", { className: "bridge-panel__forced" }, [
    element("p", { className: "bridge-panel__hint", text: forcedWarning.text }),
    release,
  ]);
}

function failureBlock(view: BridgeView, onToggle: (open: boolean) => void, logOpen: boolean) {
  const { failure } = view;
  if (failure === null) {
    return null;
  }
  const log = element("details", { className: "bridge-panel__log" }, [
    element("summary", { text: failure.logTitle }),
    element("pre", { text: failure.log.join("\n") }),
  ]);
  log.open = logOpen;
  log.addEventListener("toggle", () => onToggle(log.open));
  return element(
    "div",
    {
      className: `bridge-panel__failure${failure.warning ? " is-warning" : ""}`,
      attributes: { role: "alert" },
    },
    [
      element("strong", { text: failure.headline }),
      element("p", { className: "bridge-panel__message", text: failure.message }),
      failure.log.length === 0 ? null : log,
    ],
  );
}

export class BridgePanel {
  readonly element = element("section", { className: "bridge-panel" });
  private shownKey: string | null = null;
  // The latest view, not the one a handler was built with: a status may have
  // arrived without a redraw since.
  private latestView: BridgeView | null = null;
  private logOpen = false;
  private networkOpen = false;

  constructor() {
    this.element.hidden = true;
  }

  render(view: BridgeView | null, intents: PanelIntents): void {
    this.element.hidden = view === null;
    this.latestView = view;
    if (view === null) {
      this.shownKey = null;
      return;
    }
    // The typed text lives in the input; only the other fields decide a redraw.
    const key = bridgeRedrawKey(view);
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.draw(view, intents);
    }
    this.syncAllowText(view.allowText);
  }

  private draw(view: BridgeView, intents: PanelIntents): void {
    const snapshot = captureFocus(this.element);
    this.element.replaceChildren(...this.content(view, intents));
    this.element.setAttribute("aria-label", view.label);
    restoreFocus(this.element, snapshot);
  }

  // A status can change the text (Restart shows the last network) without a
  // redraw; a field being typed in is left alone.
  private syncAllowText(text: string): void {
    const input = this.element.querySelector<HTMLInputElement>("#bridge-allow");
    if (input !== null && document.activeElement !== input && input.value !== text) {
      input.value = text;
    }
  }

  private content(view: BridgeView, intents: PanelIntents): HTMLElement[] {
    const header = element("div", { className: "bridge-panel__header" }, [
      element("h2", { className: "bridge-panel__title", text: view.label }),
      element("div", { className: "bridge-panel__tools" }, [
        journalButton(view, intents),
        configureIoButton(view, intents),
        actionButton(view, intents),
      ]),
    ]);
    const rows: (HTMLElement | null)[] = [
      header,
      this.stateRow(view, intents),
      view.notice === null
        ? null
        : element("p", { className: "bridge-panel__notice", text: view.notice }),
      this.isNetworkOpen(view) ? this.networkFields(view, intents) : null,
      view.networkError === null
        ? null
        : element("p", {
            className: "bridge-panel__error",
            text: view.networkError,
            attributes: { role: "alert" },
          }),
      modulesBlock(view),
      view.runningHint === null
        ? null
        : element("p", { className: "bridge-panel__hint", text: view.runningHint }),
      forcedWarningBlock(view, intents),
      failureBlock(view, (open) => (this.logOpen = open), this.logOpen),
    ];
    return rows.filter((row): row is HTMLElement => row !== null);
  }

  // An opening forced by a refusal is not the user's choice: it is not kept.
  private isNetworkOpen(view: BridgeView): boolean {
    return this.networkOpen || view.networkForcedOpen;
  }

  private stateRow(view: BridgeView, intents: PanelIntents): HTMLElement {
    const chip = element("button", {
      className: "bridge-panel__chip",
      text: view.networkTitle,
      attributes: {
        type: "button",
        "aria-expanded": String(this.isNetworkOpen(view)),
        "data-focus-key": "bridge-network-chip",
      },
    });
    chip.addEventListener("click", () => {
      const latest = this.latestView ?? view;
      if (!latest.networkForcedOpen) {
        this.networkOpen = !this.networkOpen;
        this.draw(latest, intents);
        this.syncAllowText(latest.allowText);
      }
    });
    return element("div", { className: "bridge-panel__state" }, [
      statusDot(view.stateTone),
      element("span", {
        className: "bridge-panel__state-text",
        text: view.stateText,
        attributes: { role: "status" },
      }),
      chip,
    ]);
  }

  private networkFields(view: BridgeView, intents: PanelIntents): HTMLElement {
    return element("div", { className: "bridge-panel__fields" }, [
      networkChoice(view, "local", view.localLabel, intents),
      networkChoice(view, "lan", view.lanLabel, intents),
      ...lanFields(view, intents),
    ]);
  }
}
