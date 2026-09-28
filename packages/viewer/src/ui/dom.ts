// Tiny helpers so that components read as a tree of elements, without a framework.

interface ElementOptions {
  className?: string;
  text?: string;
  attributes?: Readonly<Record<string, string>>;
}

export function element<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  options: ElementOptions = {},
  children: readonly (Node | null)[] = [],
): HTMLElementTagNameMap[Tag] {
  const created = document.createElement(tag);
  if (options.className !== undefined) {
    created.className = options.className;
  }
  if (options.text !== undefined) {
    created.textContent = options.text;
  }
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    created.setAttribute(name, value);
  }
  for (const child of children) {
    if (child !== null) {
      created.append(child);
    }
  }
  return created;
}

export function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const created = element("button", { className, text: label, attributes: { type: "button" } });
  created.addEventListener("click", onClick);
  return created;
}

/**
 * A text input that commits on Enter or when it loses focus, and only when the
 * value really changed. Escape restores the committed value.
 */
export function committingTextInput(
  value: string,
  label: string,
  onCommit: (value: string) => void,
): HTMLInputElement {
  const input = element("input", {
    className: "text-input",
    attributes: { type: "text", "aria-label": label, spellcheck: "false" },
  });
  input.value = value;
  const commit = () => {
    // A re-render may detach the input; that is not the user leaving the field.
    if (input.isConnected && input.value.trim() !== value) {
      onCommit(input.value);
    }
  };
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      input.blur();
    } else if (event.key === "Escape") {
      input.value = value;
      input.blur();
    }
  });
  return input;
}

export function selectInput<Value extends string>(
  options: Readonly<Record<Value, string>>,
  selected: Value,
  label: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const select = element("select", {
    className: "select-input",
    attributes: { "aria-label": label },
  });
  for (const [value, text] of Object.entries<string>(options)) {
    const option = element("option", { text, attributes: { value } });
    option.selected = value === selected;
    select.append(option);
  }
  select.addEventListener("change", () => onChange(select.value));
  return select;
}
