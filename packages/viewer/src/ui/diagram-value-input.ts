import { element } from "./dom.ts";

// The small input of a numeric command (ADR 0030 point 3), beside its socket:
// Enter sends, Escape or leaving it closes without writing, and a value that
// is not a number keeps it open, marked invalid. It reuses the link menu's
// way of sitting in the diagram host.

export interface ValueInputSpec {
  // The accessible name of the field: the tag's label.
  label: string;
  // The symbol shown after the field, in display units; null when it has none.
  unit: string | null;
  invalidText: string;
  // The current value in display units, which the field starts with, selected.
  initial: string;
}

export class ValueInput {
  private box: HTMLElement | null = null;
  private opener: Element | null = null;
  private scrollHost: HTMLElement | null = null;
  // The box is placed once, where the socket was: when the diagram scrolls it
  // would float off it, so it closes instead of following.
  private readonly onScroll = () => this.close(false);

  /** Opens the input under `opener`; `submit` says whether it accepted the text. */
  open(
    host: HTMLElement,
    opener: Element,
    spec: ValueInputSpec,
    submit: (text: string) => boolean,
  ): void {
    this.close(false);
    const input = element("input", {
      className: "text-input",
      attributes: { type: "text", "aria-label": spec.label, spellcheck: "false" },
    });
    input.addEventListener("input", () => this.markInvalid(input, false, spec));
    input.addEventListener("keydown", (event) => {
      // Typing here is not a shortcut of the window or of the diagram.
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        this.send(input, spec, submit);
      } else if (event.key === "Escape") {
        this.close(true);
      }
    });
    input.addEventListener("blur", () => this.close(false));
    const place = opener.getBoundingClientRect();
    const unit = spec.unit === null ? null : element("span", { text: spec.unit });
    const box = element(
      "div",
      {
        className: "diagram-value-input",
        attributes: {
          style: `left: ${Math.round(place.left)}px; top: ${Math.round(place.bottom)}px`,
        },
      },
      [input, unit],
    );
    this.box = box;
    this.opener = opener;
    this.scrollHost = host;
    host.addEventListener("scroll", this.onScroll);
    host.append(box);
    input.value = spec.initial;
    input.focus();
    input.select();
  }

  isOpen(): boolean {
    return this.box !== null;
  }

  /** Closes the input; the focus goes back to the socket unless something else took it. */
  close(restoreFocus: boolean): void {
    const { box, opener } = this;
    // The blur that removing the field raises must not close twice.
    this.box = null;
    this.opener = null;
    this.scrollHost?.removeEventListener("scroll", this.onScroll);
    this.scrollHost = null;
    box?.remove();
    if (restoreFocus && opener instanceof SVGElement) {
      opener.focus();
    }
  }

  private send(input: HTMLInputElement, spec: ValueInputSpec, submit: (text: string) => boolean) {
    if (submit(input.value)) {
      this.close(true);
    } else {
      this.markInvalid(input, true, spec);
    }
  }

  private markInvalid(input: HTMLInputElement, invalid: boolean, spec: ValueInputSpec): void {
    input.classList.toggle("is-invalid", invalid);
    if (invalid) {
      input.setAttribute("aria-invalid", "true");
      input.title = spec.invalidText;
    } else {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("title");
    }
  }
}
