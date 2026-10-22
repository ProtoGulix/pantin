import { type OpcuaBridgeView, opcuaRedrawKey } from "../bridge/opcua-view.ts";
import { bridgeFailureBlock } from "./bridge-failure.ts";
import { element, iconButton } from "./dom.ts";
import { captureFocus, restoreFocus } from "./focus.ts";
import {
  certificateBlock,
  moduleBlock,
  type TypedPasswords,
  trustPromptBlock,
} from "./opcua-bridge-parts.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { glyphThenText } from "./state-glyph.ts";
import { statusDot } from "./status-dot.ts";

// The OPC UA card under the Modbus one in the left side panel (ADR 0065 point 13): a target per
// module, a password field for `user` modules, Pantin's thumbprints, the trust prompt and each
// module's reason in words. Written in place when the view changes, never when it is identical.

const ACTION_ICONS = { start: "play", stop: "stop", restart: "restart" } as const;

export class OpcuaBridgePanel {
  readonly element = element("section", { className: "bridge-panel opcua-panel" });
  private shownKey: string | null = null;
  private logOpen = false;
  private certificateOpen = false;
  // Typed passwords live here, in memory, until a request leaves: never in a model, a view, the
  // browser's storage or a log (ADR 0065 point 9).
  private readonly typedPasswords: TypedPasswords = new Map();

  constructor() {
    this.element.hidden = true;
  }

  render(view: OpcuaBridgeView | null, intents: PanelIntents): void {
    this.element.hidden = view === null;
    if (view === null) {
      this.shownKey = null;
      this.clearPasswords();
      return;
    }
    // The typed targets live in their inputs; only the other fields decide a redraw.
    const key = opcuaRedrawKey(view);
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.draw(view, intents);
    }
    this.syncTargets(view);
  }

  private draw(view: OpcuaBridgeView, intents: PanelIntents): void {
    const snapshot = captureFocus(this.element);
    this.element.replaceChildren(...this.content(view, intents));
    this.element.setAttribute("aria-label", view.label);
    restoreFocus(this.element, snapshot);
  }

  // A status can change the targets (Restart shows the last start's) without a redraw; a field
  // being typed in is left alone.
  private syncTargets(view: OpcuaBridgeView): void {
    for (const line of view.moduleLines) {
      const input = this.element.querySelector<HTMLInputElement>(
        `[data-opcua-target="${CSS.escape(line.key)}"]`,
      );
      if (input !== null && document.activeElement !== input && input.value !== line.target) {
        input.value = line.target;
      }
    }
  }

  // The values were handed to the request: they must not stay on screen or in memory.
  private takePasswords(): Record<string, string> {
    const passwords = Object.fromEntries(this.typedPasswords);
    this.clearPasswords();
    return passwords;
  }

  private clearPasswords(): void {
    this.typedPasswords.clear();
    for (const input of this.element.querySelectorAll<HTMLInputElement>("[data-opcua-password]")) {
      input.value = "";
    }
  }

  private actionButton(view: OpcuaBridgeView, intents: PanelIntents): HTMLElement {
    const { kind, label, enabled } = view.button;
    const created = iconButton(ACTION_ICONS[kind], label, () => {
      if (!enabled) {
        return;
      }
      if (kind === "stop") {
        intents.stopOpcuaBridge();
      } else {
        intents.startOpcuaBridge(this.takePasswords());
      }
    });
    created.classList.add("bridge-panel__tool");
    created.setAttribute("data-focus-key", "opcua-action");
    created.setAttribute("aria-disabled", String(!enabled));
    if (view.notice !== null) {
      created.title = view.notice;
    }
    return created;
  }

  private content(view: OpcuaBridgeView, intents: PanelIntents): HTMLElement[] {
    const rows: (HTMLElement | null)[] = [
      element("div", { className: "bridge-panel__header" }, [
        element("h2", { className: "bridge-panel__title", text: view.label }),
        element("div", { className: "bridge-panel__tools" }, [this.actionButton(view, intents)]),
      ]),
      element("div", { className: "bridge-panel__state" }, [
        statusDot(view.stateTone),
        element("span", {
          className: "bridge-panel__state-text",
          text: view.stateText,
          attributes: { role: "status" },
        }),
      ]),
      textLine(view.notice, "bridge-panel__notice"),
      view.networkError === null
        ? null
        : element(
            "p",
            { className: "bridge-panel__error", attributes: { role: "alert" } },
            glyphThenText("error", view.networkError),
          ),
      element(
        "ul",
        { className: "bridge-panel__modules opcua-modules" },
        view.moduleLines.map((line) => moduleBlock(line, this.typedPasswords, intents)),
      ),
      textLine(view.runningHint, "bridge-panel__hint"),
      ...this.certificateRows(view),
      bridgeFailureBlock(view, (open) => (this.logOpen = open), this.logOpen),
      textLine(view.failureExplanation, "bridge-panel__message"),
      view.trustPrompt === null
        ? null
        : trustPromptBlock(view.trustPrompt, (sha256) => this.trust(sha256, intents)),
    ];
    return rows.filter((row): row is HTMLElement => row !== null);
  }

  // The hash sent is the one the clicked prompt shows.
  private trust(sha256: string, intents: PanelIntents): void {
    intents.trustAndRestartOpcuaBridge(sha256, this.takePasswords());
  }

  private certificateRows(view: OpcuaBridgeView): (HTMLElement | null)[] {
    return [
      view.rejectionNotice === null
        ? null
        : element(
            "p",
            { className: "bridge-panel__error", attributes: { role: "alert" } },
            glyphThenText("error", view.rejectionNotice),
          ),
      view.certificate === null
        ? textLine(view.certificateHint, "bridge-panel__hint")
        : certificateBlock(
            view.certificate,
            this.certificateOpen,
            (open) => (this.certificateOpen = open),
          ),
    ];
  }
}

function textLine(text: string | null, className: string): HTMLElement | null {
  return text === null ? null : element("p", { className, text });
}
