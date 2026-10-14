import { type BridgeView, bridgeRedrawKey } from "../bridge/bridge-view.ts";
import { committingTextInput, element, selectInput } from "./dom.ts";
import { captureFocus, restoreFocus } from "./focus.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The bridge bar at the top of the I/O view (ADR 0050 point 8). It is written
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
  return element("label", { className: "bridge-bar__choice" }, [radio, element("span", { text })]);
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
  allow.className = "text-input bridge-bar__allow";
  allow.id = "bridge-allow";
  allow.placeholder = view.allowLabel;
  allow.title = view.allowLabel;
  allow.disabled = view.networkLocked;
  return [listen, allow];
}

function actionButton(view: BridgeView, intents: PanelIntents): HTMLElement {
  const created = element("button", {
    className: "io-button bridge-bar__button",
    text: view.button.label,
    attributes: { type: "button", "data-focus-key": "bridge-action" },
  });
  // aria-disabled keeps the tooltip and the focus, like the other I/O buttons.
  created.setAttribute("aria-disabled", String(!view.button.enabled));
  created.addEventListener("click", () => {
    if (view.button.enabled) {
      if (view.button.kind === "stop") {
        intents.stopBridge();
      } else {
        intents.startBridge();
      }
    }
  });
  if (view.notice !== null) {
    created.title = view.notice;
  }
  return created;
}

function failureBlock(view: BridgeView, onToggle: (open: boolean) => void, logOpen: boolean) {
  const { failure } = view;
  if (failure === null) {
    return null;
  }
  const log = element("details", { className: "bridge-bar__log" }, [
    element("summary", { text: failure.logTitle }),
    element("pre", { text: failure.log.join("\n") }),
  ]);
  log.open = logOpen;
  log.addEventListener("toggle", () => onToggle(log.open));
  return element(
    "div",
    {
      className: `bridge-bar__failure${failure.warning ? " is-warning" : ""}`,
      attributes: { role: "alert" },
    },
    [
      element("strong", { text: failure.headline }),
      element("p", { className: "bridge-bar__message", text: failure.message }),
      failure.log.length === 0 ? null : log,
    ],
  );
}

export class BridgeBar {
  readonly element = element("div", { className: "bridge-bar" });
  private shownKey: string | null = null;
  private logOpen = false;

  constructor() {
    this.element.hidden = true;
  }

  render(view: BridgeView | null, intents: PanelIntents): void {
    this.element.hidden = view === null;
    if (view === null) {
      this.shownKey = null;
      return;
    }
    // The typed text lives in the input; only the other fields decide a redraw.
    const key = bridgeRedrawKey(view);
    if (key !== this.shownKey) {
      this.shownKey = key;
      const snapshot = captureFocus(this.element);
      this.element.replaceChildren(...this.content(view, intents));
      this.element.setAttribute("aria-label", view.label);
      restoreFocus(this.element, snapshot);
    }
    this.syncAllowText(view.allowText);
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
    const chip = element("span", {
      className: `bridge-bar__chip is-${view.chipTone}`,
      text: view.chipText,
      attributes: { role: "status" },
    });
    const controls = element("div", { className: "bridge-bar__row" }, [
      element("strong", { className: "bridge-bar__label", text: view.label }),
      chip,
      networkChoice(view, "local", view.localLabel, intents),
      networkChoice(view, "lan", view.lanLabel, intents),
      ...lanFields(view, intents),
      actionButton(view, intents),
    ]);
    const lines = view.moduleLines.map((line) => element("div", { text: line }));
    const rows: (HTMLElement | null)[] = [
      controls,
      view.notice === null
        ? null
        : element("p", { className: "bridge-bar__notice", text: view.notice }),
      view.networkError === null
        ? null
        : element("p", {
            className: "bridge-bar__error",
            text: view.networkError,
            attributes: { role: "alert" },
          }),
      lines.length === 0 ? null : element("div", { className: "bridge-bar__modules" }, lines),
      view.runningHint === null
        ? null
        : element("p", { className: "bridge-bar__hint", text: view.runningHint }),
      failureBlock(view, (open) => (this.logOpen = open), this.logOpen),
    ];
    return rows.filter((row): row is HTMLElement => row !== null);
  }
}
