import { type EditOutcome, EditSession, enterAction } from "./edit-session.ts";
import { type IconName, icon } from "./icons.ts";

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

/** A square icon button; the label is its tooltip and its accessible name. */
export function iconButton(
  name: IconName,
  label: string,
  onClick: () => void,
  disabled = false,
): HTMLButtonElement {
  const created = element(
    "button",
    { className: "icon-button", attributes: { type: "button", title: label, "aria-label": label } },
    [icon(name)],
  );
  created.disabled = disabled;
  created.addEventListener("click", onClick);
  return created;
}

interface CommitOptions {
  label: string;
  // Identifies the input across re-renders so focus and typing survive them.
  focusKey: string;
  onCommit(value: string): void;
  onCancel?(): void;
  // False for creation forms: leaving the field must not create anything.
  commitOnBlur?: boolean;
  // Where Enter sends keyboard focus (the tree after a rename); without it,
  // Enter just blurs the field.
  focusOnEnter?: () => void;
}

function applyOutcome(outcome: EditOutcome, options: CommitOptions): void {
  if (outcome.type === "commit") {
    options.onCommit(outcome.value);
  } else if (outcome.type === "cancel") {
    options.onCancel?.();
  }
}

function listenToEditKeys(
  input: HTMLInputElement,
  session: EditSession,
  initialValue: string,
  options: CommitOptions,
): void {
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      // Moving focus first: the blur handler commits once, and focus has
      // already left when the commit redraws the panel, so it is not
      // restored into a new field.
      const action = enterAction(options.commitOnBlur ?? true, options.focusOnEnter !== undefined);
      if (action === "moveFocus") {
        options.focusOnEnter?.();
      } else if (action === "blur") {
        input.blur();
      } else {
        applyOutcome(session.finish(input.value), options);
      }
    } else if (event.key === "Escape") {
      input.value = initialValue;
      applyOutcome(session.abandon(), options);
      input.blur();
    }
  });
}

/**
 * A text input that commits on Enter or when it loses focus, and only when the
 * value really changed. Escape restores the value (or cancels, if asked).
 */
export function committingTextInput(value: string, options: CommitOptions): HTMLInputElement {
  const input = element("input", {
    className: "text-input",
    attributes: {
      type: "text",
      "aria-label": options.label,
      spellcheck: "false",
      "data-focus-key": options.focusKey,
    },
  });
  input.value = value;
  const session = new EditSession(value);
  input.addEventListener("focus", () => session.begin());
  if (options.commitOnBlur ?? true) {
    input.addEventListener("blur", () => {
      // A re-render may detach the input; that is not the user leaving the field.
      if (input.isConnected) {
        applyOutcome(session.finish(input.value), options);
      }
    });
  }
  listenToEditKeys(input, session, value, options);
  return input;
}

// A list, not a record: a record puts integer-like keys (a body named "2")
// first, whatever the order the caller chose.
export function selectInput(
  options: readonly { value: string; label: string }[],
  selected: string,
  label: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const select = element("select", {
    className: "select-input",
    attributes: { "aria-label": label, title: label },
  });
  for (const { value, label: text } of options) {
    const option = element("option", { text, attributes: { value } });
    option.selected = value === selected;
    select.append(option);
  }
  select.addEventListener("change", () => onChange(select.value));
  return select;
}
