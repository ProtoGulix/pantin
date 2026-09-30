import { element } from "./dom.ts";

// Small controls shared by the drives and sensors sections of the right-hand
// panel (ADR 0022, ADR 0023).

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
  return element("label", { className: "drive-panel__check" }, [
    input,
    element("span", { text: label }),
  ]);
}

// The value spans carry what showTagValues needs: the tag and its unit.
export function valueSpan(name: string, coordinateUnit: string | null): HTMLElement {
  return element("span", {
    className: "drive-panel__value",
    attributes: { "data-tag-value": name, "data-unit": coordinateUnit ?? "" },
  });
}
