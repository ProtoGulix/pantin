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

// The name of the group to make. Typing redraws the prompt: the focus key keeps
// the caret in the field. Enter answers with the primary choice, when allowed.
function nameField(
  prompt: PromptView,
  field: { label: string; value: string; focusKey: string },
  intents: PanelIntents,
): HTMLElement {
  const input = element("input", {
    className: "text-input prompt-line__field",
    attributes: { type: "text", "data-focus-key": field.focusKey, "aria-label": field.label },
  });
  input.value = field.value;
  input.disabled = !prompt.enabled;
  input.addEventListener("input", () => intents.editGroupName(input.value));
  input.addEventListener("keydown", (event) => {
    const confirm = prompt.actions.find((entry) => entry.primary && entry.disabled !== true);
    if (event.key === "Enter" && confirm !== undefined && prompt.enabled) {
      event.preventDefault();
      intents.resolvePrompt(confirm.action);
    }
  });
  return element("label", { className: "prompt-line__option" }, [
    element("span", { text: field.label }),
    input,
  ]);
}

function detailList(details: readonly string[] | undefined): HTMLElement[] {
  if (details === undefined || details.length === 0) {
    return [];
  }
  const items = details.map((detail) => element("li", { text: detail }));
  return [element("ul", { className: "prompt-line__details" }, items)];
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
    choice.disabled = !prompt.enabled || entry.disabled === true;
    return choice;
  });
  const text = element("div", { className: "prompt-line__text", text: prompt.text });
  text.id = "prompt-line-text";
  const details = detailList(prompt.details);
  const box =
    prompt.checkbox === undefined ? [] : [closeBridgeBox(prompt, prompt.checkbox, intents)];
  const nameInput =
    prompt.textField === undefined ? [] : [nameField(prompt, prompt.textField, intents)];
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
      ...nameInput,
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
