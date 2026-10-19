import type { AboutView } from "../panel/about-model.ts";
import { nextFocusIndex } from "../panel/welcome-model.ts";
import { element } from "./dom.ts";
import { icon } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";
import { glyphThenText } from "./state-glyph.ts";

// The About window of the Help menu (ADR 0058 point 4): a modal over the central
// area like the welcome dialog. Its elements are made once and written in place,
// so a store update never rebuilds a link the user is pressing. Escape closes it.

const FOCUSABLE = "button:not([disabled]), a[href]";
const LINK_COUNT = 2;

function definition(): { term: HTMLElement; value: HTMLElement } {
  return {
    term: element("dt", { className: "about__term" }),
    value: element("dd", { className: "about__value" }),
  };
}

export class AboutDialog {
  private readonly overlay: HTMLElement;
  private readonly title = element("h2", {
    className: "welcome__title",
    attributes: { id: "about-title" },
  });
  private readonly closeButton = element("button", {
    className: "icon-button",
    attributes: { type: "button" },
  });
  private readonly name = element("p", { className: "about__name", text: "Pantin" });
  private readonly viewer = definition();
  private readonly core = definition();
  private readonly licence = definition();
  private readonly mismatch = element("p", {
    className: "about__mismatch",
    attributes: { role: "alert" },
  });
  private readonly links = Array.from({ length: LINK_COUNT }, () =>
    element(
      "a",
      {
        className: "welcome-link",
        attributes: { target: "_blank", rel: "noopener noreferrer" },
      },
      [element("span"), element("span", { className: "visually-hidden" })],
    ),
  );
  private readonly dialog: HTMLElement;
  private intents: PanelIntents | null = null;
  private returnFocusTo: Element | null = null;

  constructor(overlay: HTMLElement) {
    this.overlay = overlay;
    this.closeButton.append(icon("close"));
    this.dialog = element(
      "div",
      {
        className: "welcome about",
        attributes: { role: "dialog", "aria-modal": "true", "aria-labelledby": "about-title" },
      },
      [
        element("header", { className: "welcome__header" }, [this.title, this.closeButton]),
        element("div", { className: "about__body" }, [
          element("div", { className: "about__identity" }, [
            icon("pantin", "icon about__symbol"),
            this.name,
          ]),
          element("dl", { className: "about__list" }, [
            this.viewer.term,
            this.viewer.value,
            this.core.term,
            this.core.value,
            this.licence.term,
            this.licence.value,
          ]),
          this.mismatch,
          element(
            "ul",
            { className: "welcome-links" },
            this.links.map((link) => element("li", {}, [link])),
          ),
        ]),
      ],
    );
    overlay.replaceChildren(this.dialog);
    this.listen();
  }

  render(view: AboutView, intents: PanelIntents): void {
    this.intents = intents;
    if (!view.visible) {
      this.hide();
      return;
    }
    if (this.overlay.hidden) {
      this.returnFocusTo = document.activeElement;
      this.overlay.hidden = false;
      this.closeButton.focus();
    }
    this.draw(view);
  }

  private hide(): void {
    if (this.overlay.hidden) {
      return;
    }
    this.overlay.hidden = true;
    if (this.returnFocusTo instanceof HTMLElement) {
      this.returnFocusTo.focus();
    }
    this.returnFocusTo = null;
  }

  private draw(view: AboutView): void {
    this.title.textContent = view.title;
    this.closeButton.setAttribute("aria-label", view.closeLabel);
    this.closeButton.title = view.closeLabel;
    this.viewer.term.textContent = view.viewerLabel;
    this.viewer.value.textContent = view.viewerVersion;
    this.core.term.textContent = view.coreLabel;
    this.core.value.textContent = view.coreText;
    this.licence.term.textContent = view.licenceLabel;
    this.licence.value.textContent = view.licenceName;
    // The warning begins with its triangle: the colour is never the only cue (ADR 0057 rule 4).
    this.mismatch.hidden = view.mismatch === null;
    this.mismatch.replaceChildren(
      ...(view.mismatch === null ? [] : glyphThenText("warning", view.mismatch)),
    );
    this.links.forEach((link, index) => {
      const target = view.links[index];
      const [text, hint] = link.children;
      if (target !== undefined && text !== undefined && hint !== undefined) {
        link.href = target.href;
        text.textContent = target.label;
        hint.textContent = ` ${view.newTabHint}`;
      }
    });
  }

  private listen(): void {
    this.closeButton.addEventListener("click", () => this.intents?.closeAbout());
    // Capture on the document: the welcome dialog may be open beneath, and its own
    // Escape handler must not see the key that closes this window.
    document.addEventListener("keydown", (event) => this.onKey(event), true);
  }

  private onKey(event: KeyboardEvent): void {
    if (this.overlay.hidden) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.intents?.closeAbout();
    } else if (event.key === "Tab") {
      const controls = [...this.dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const active = document.activeElement;
      const index = nextFocusIndex(
        controls.length,
        active instanceof HTMLElement ? controls.indexOf(active) : -1,
        event.shiftKey,
      );
      event.preventDefault();
      controls[index]?.focus();
    }
  }
}
