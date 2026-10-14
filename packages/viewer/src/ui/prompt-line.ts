import type { PromptView } from "../panel/prompt-model.ts";
import { button, element } from "./dom.ts";
import { icon } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";

// Inline confirmation above the message line (role=alertdialog), used
// instead of window.confirm: unsaved changes on close, body deletion.

function closeBridgeBox(
  prompt: PromptView,
  checkbox: { label: string; checked: boolean },
  intents: PanelIntents,
): HTMLElement {
  // Ticking redraws the prompt: the focus key keeps a keyboard user on the box.
  const input = element("input", {
    attributes: { type: "checkbox", "data-focus-key": "prompt-close-stops-bridge" },
  });
  input.checked = checkbox.checked;
  input.disabled = !prompt.enabled;
  input.addEventListener("change", () => intents.setCloseStopsBridge(input.checked));
  return element("label", { className: "prompt-line__option" }, [
    input,
    element("span", { text: checkbox.label }),
  ]);
}

export function renderPromptLine(
  prompt: PromptView | null,
  intents: PanelIntents,
): HTMLElement | null {
  if (prompt === null) {
    return null;
  }
  const buttons = prompt.actions.map((entry) => {
    const choice = button(entry.label, entry.primary ? "button button--primary" : "button", () =>
      intents.resolvePrompt(entry.action),
    );
    choice.disabled = !prompt.enabled;
    return choice;
  });
  const text = element("div", { className: "prompt-line__text", text: prompt.text });
  text.id = "prompt-line-text";
  const details =
    prompt.details === undefined || prompt.details.length === 0
      ? []
      : [
          element(
            "ul",
            { className: "prompt-line__details" },
            prompt.details.map((detail) => element("li", { text: detail })),
          ),
        ];
  const box =
    prompt.checkbox === undefined ? [] : [closeBridgeBox(prompt, prompt.checkbox, intents)];
  const line = element(
    "div",
    {
      className: "prompt-line",
      attributes: { role: "alertdialog", "aria-describedby": "prompt-line-text" },
    },
    [
      element("div", { className: "prompt-line__question" }, [icon("info"), text]),
      ...details,
      ...box,
      element("div", { className: "prompt-line__actions" }, buttons),
    ],
  );
  // Escape is the cancel choice, as in a dialog.
  const cancel = prompt.actions.find((entry) => entry.action.startsWith("cancel"));
  line.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && cancel !== undefined && prompt.enabled) {
      event.stopPropagation();
      intents.resolvePrompt(cancel.action);
    }
  });
  return line;
}
