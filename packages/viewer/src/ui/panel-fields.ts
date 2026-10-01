import { element } from "./dom.ts";

// Small controls shared by the device forms of the inspector (ADR 0022, ADR 0023).

export function field(label: string, control: HTMLElement): HTMLElement {
  return element("label", { className: "inline-field" }, [
    element("span", { className: "inline-field__label", text: label }),
    control,
  ]);
}

export function formInput(
  focusKey: string,
  value: string,
  label: string,
  onInput: (text: string) => void,
) {
  const input = element("input", {
    className: "text-input",
    attributes: {
      type: "text",
      "aria-label": label,
      "data-focus-key": focusKey,
      spellcheck: "false",
    },
  });
  input.value = value;
  input.addEventListener("input", () => onInput(input.value));
  return input;
}

export function checkbox(label: string, checked: boolean, onChange: (checked: boolean) => void) {
  const input = element("input", { attributes: { type: "checkbox" } });
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  return element("label", { className: "inspector__check" }, [
    input,
    element("span", { text: label }),
  ]);
}
