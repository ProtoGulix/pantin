import { committingTextInput, element } from "./dom.ts";

// aria-disabled and a guard, not `disabled`: the panel is redrawn when a request
// starts and ends, and a disabled button would drop the keyboard focus.
export function ioButton(
  label: string,
  className: string,
  busy: boolean,
  focusKey: string,
  onClick: () => void,
): HTMLButtonElement {
  const created = element("button", {
    className: `${className}${busy ? " is-busy" : ""}`,
    text: label,
    attributes: { type: "button", "aria-disabled": String(busy), "data-focus-key": focusKey },
  });
  created.addEventListener("click", () => {
    if (!busy) {
      onClick();
    }
  });
  return created;
}

// Cells of the I/O view (ADR 0049 point 11). A cell with problems is marked
// and says why in its tooltip; its id is where a click on the problem list
// lands (io/io-problems.ts).

function markProblems(target: HTMLElement, messages: readonly string[] | undefined): void {
  if (messages !== undefined && messages.length > 0) {
    target.classList.add("is-problem");
    target.title = messages.join("\n");
    target.setAttribute("aria-invalid", "true");
  }
}

/** A cell the user cannot type in; focusable so that a problem can lead to it. */
export function readOnlyCell(id: string, text: string, messages?: readonly string[]): HTMLElement {
  const cell = element("td", {
    className: "io-cell io-cell--derived",
    text,
    attributes: { id, tabindex: "-1" },
  });
  markProblems(cell, messages);
  return cell;
}

export function inputCell(
  id: string,
  label: string,
  value: string,
  messages: readonly string[] | undefined,
  onCommit: (text: string) => void,
): HTMLElement {
  const input = committingTextInput(value, { label, focusKey: id, onCommit });
  input.id = id;
  markProblems(input, messages);
  return element("td", { className: "io-cell" }, [input]);
}

/** A labelled setting of a module, committed when the field is left. */
export function settingField(
  id: string,
  label: string,
  value: string,
  messages: readonly string[] | undefined,
  onCommit: (text: string) => void,
): HTMLElement {
  const input = committingTextInput(value, { label, focusKey: id, onCommit });
  input.id = id;
  markProblems(input, messages);
  const caption = element("label", { className: "io-field__label", text: label });
  caption.htmlFor = id;
  return element("div", { className: "io-field" }, [caption, input]);
}
