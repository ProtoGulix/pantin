import { moduleConnectionTone } from "../bridge/module-connection.ts";
import type {
  OpcuaCertificateView,
  OpcuaTrustPromptView,
  ThumbprintView,
} from "../bridge/opcua-certificate-view.ts";
import type { OpcuaModuleLine } from "../bridge/opcua-view.ts";
import { button, committingTextInput, element } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { glyphThenText } from "./state-glyph.ts";
import { statusDot } from "./status-dot.ts";

// The parts of the OPC UA card (ADR 0065 point 13). A thumbprint is plain, selectable text that
// the user compares with the PLC's screen; every state is written next to its glyph.

/** The passwords typed in the card, by module key: held here until a request leaves. */
export type TypedPasswords = Map<string, string>;

function labelled(label: string, field: HTMLElement): HTMLElement {
  return element("label", { className: "opcua-field" }, [
    element("span", { className: "opcua-field__label", text: label }),
    field,
  ]);
}

function targetField(line: OpcuaModuleLine, intents: PanelIntents): HTMLElement {
  const input = committingTextInput(line.target, {
    label: line.targetLabel,
    focusKey: `opcua-target-${line.key}`,
    onCommit: (text) => intents.editOpcuaTarget(line.key, text),
  });
  input.setAttribute("data-opcua-target", line.key);
  input.disabled = line.targetLocked;
  return labelled(line.targetLabel, input);
}

// Never stored by the browser (no autofill, no name), and never part of a view: the value lives in
// the input and in `typed`, which the card empties as soon as a request leaves.
function passwordField(line: OpcuaModuleLine, typed: TypedPasswords): HTMLElement | null {
  if (line.passwordLabel === null) {
    return null;
  }
  const input = element("input", {
    className: "text-input",
    attributes: {
      type: "password",
      autocomplete: "new-password",
      "aria-label": line.passwordLabel,
      "data-focus-key": `opcua-password-${line.key}`,
      "data-opcua-password": line.key,
    },
  });
  input.value = typed.get(line.key) ?? "";
  input.disabled = line.targetLocked;
  input.addEventListener("input", () => typed.set(line.key, input.value));
  return element("div", { className: "opcua-field-group" }, [
    labelled(line.passwordLabel, input),
    element("span", { className: "bridge-panel__hint", text: line.passwordHint ?? "" }),
  ]);
}

export function moduleBlock(
  line: OpcuaModuleLine,
  typed: TypedPasswords,
  intents: PanelIntents,
): HTMLElement {
  return element("li", { className: "opcua-module" }, [
    element("div", { className: "bridge-panel__module" }, [
      statusDot(moduleConnectionTone(line.connection)),
      element("span", { className: "bridge-panel__module-key", text: line.key }),
      element("span", { className: "bridge-panel__module-address", text: line.endpoint }),
      element("span", {
        className: "bridge-panel__module-status",
        text:
          line.reasonText === null ? line.statusText : `${line.statusText} (${line.reasonText})`,
      }),
    ]),
    element("span", { className: "bridge-panel__hint", text: line.loginText }),
    targetField(line, intents),
    passwordField(line, typed),
  ]);
}

function thumbprintLines(thumbprints: readonly ThumbprintView[]): HTMLElement[] {
  return thumbprints.map((thumbprint) =>
    element("p", { className: "opcua-thumbprint" }, [
      element("span", { className: "opcua-thumbprint__label", text: thumbprint.label }),
      element("code", { className: "opcua-thumbprint__value", text: thumbprint.value }),
    ]),
  );
}

export function certificateBlock(
  certificate: OpcuaCertificateView,
  open: boolean,
  onToggle: (open: boolean) => void,
): HTMLElement {
  const details = element("details", { className: "bridge-panel__certificate" }, [
    element("summary", { text: certificate.title }),
    element("p", { className: "bridge-panel__hint", text: certificate.explanation }),
    element("p", { className: "bridge-panel__hint", text: certificate.subjectLine }),
    element("p", { className: "bridge-panel__hint", text: certificate.applicationUriLine }),
    ...thumbprintLines(certificate.thumbprints),
  ]);
  details.open = open;
  details.addEventListener("toggle", () => onToggle(details.open));
  return details;
}

export function trustPromptBlock(
  prompt: OpcuaTrustPromptView,
  onTrust: (sha256: string) => void,
): HTMLElement {
  const trust = button(prompt.buttonLabel, "button", () => {
    if (prompt.enabled) {
      onTrust(prompt.sha256);
    }
  });
  trust.setAttribute("aria-disabled", String(!prompt.enabled));
  trust.setAttribute("data-focus-key", "opcua-trust");
  return element("div", { className: "bridge-panel__failure is-warning opcua-trust" }, [
    element(
      "strong",
      { className: "bridge-panel__headline" },
      glyphThenText("warning", prompt.headline),
    ),
    element("p", { className: "bridge-panel__message", text: prompt.explanation }),
    element("p", { className: "bridge-panel__message", text: prompt.subjectLine }),
    element("p", { className: "bridge-panel__message", text: prompt.validityLine }),
    ...thumbprintLines(prompt.thumbprints),
    trust,
  ]);
}
