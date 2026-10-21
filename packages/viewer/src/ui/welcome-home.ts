import type { MessageKey, Translate } from "../i18n/translate.ts";
import { IMPORT_FILE_ACCEPT } from "../import-options.ts";
import { REPOSITORY_URL } from "../links.ts";
import type { WelcomeView } from "../panel/welcome-model.ts";
import { element } from "./dom.ts";
import { icon } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";
import {
  cardElement,
  createPrompt,
  type ExamplesParts,
  examplesParts,
  showExamples,
  showNamePrompt,
  updateCards,
} from "./welcome-parts.ts";

// The "Home" tab of the welcome dialog: New, Examples, Recent, Resources (ADR 0027).
// Built once and redrawn in place; a recent card is kept across redraws (a
// card rebuilt between the press and the release would lose the click), and
// clicks are handled by delegation.

export interface WelcomeHome {
  element: HTMLElement;
  render(view: WelcomeView, translate: Translate, intents: PanelIntents): void;
}

const LINKS: readonly { label: MessageKey; href: string }[] = [
  { label: "welcome.link.repository", href: REPOSITORY_URL },
  { label: "welcome.link.guides", href: `${REPOSITORY_URL}/tree/master/docs/guides` },
  { label: "welcome.link.decisions", href: `${REPOSITORY_URL}/tree/master/docs/decisions` },
];

function sectionTitle(): HTMLElement {
  return element("h3", { className: "welcome-section__title" });
}

function tile(action: string, iconName: "plus" | "import"): HTMLButtonElement {
  return element(
    "button",
    {
      className: "welcome-tile",
      attributes: { type: "button", "data-action": action },
    },
    [
      icon(iconName, "icon welcome-tile__icon"),
      element("span", { className: "welcome-tile__label" }),
    ],
  );
}

// Two spans, whose texts are set in place: the link itself is never rebuilt.
function linkElement(href: string): HTMLAnchorElement {
  return element(
    "a",
    {
      className: "welcome-link",
      attributes: { href, target: "_blank", rel: "noopener noreferrer" },
    },
    [element("span"), element("span", { className: "visually-hidden" })],
  );
}

interface Parts {
  root: HTMLElement;
  newTitle: HTMLElement;
  emptyTile: HTMLButtonElement;
  fileTile: HTMLButtonElement;
  fileInput: HTMLInputElement;
  formHost: HTMLElement;
  examples: ExamplesParts;
  recentTitle: HTMLElement;
  cards: HTMLElement;
  recentEmpty: HTMLElement;
  resourcesTitle: HTMLElement;
  links: { label: MessageKey; anchor: HTMLAnchorElement }[];
  shortcutsTitle: HTMLElement;
  shortcuts: HTMLElement;
}

function assemble(parts: Omit<Parts, "root">): HTMLElement {
  const linkItems = parts.links.map(({ anchor }) => element("li", {}, [anchor]));
  return element("div", { className: "welcome-home" }, [
    element("section", { className: "welcome-section" }, [
      parts.newTitle,
      element("div", { className: "welcome-tiles" }, [parts.emptyTile, parts.fileTile]),
      parts.formHost,
      parts.fileInput,
    ]),
    parts.examples.section,
    element("div", { className: "welcome-lower" }, [
      element("section", { className: "welcome-section" }, [
        parts.recentTitle,
        parts.recentEmpty,
        parts.cards,
      ]),
      element("section", { className: "welcome-section" }, [
        parts.resourcesTitle,
        element("ul", { className: "welcome-links" }, linkItems),
        parts.shortcutsTitle,
        parts.shortcuts,
      ]),
    ]),
  ]);
}

function buildParts(): Parts {
  const examples = examplesParts();
  const parts = {
    examples,
    newTitle: sectionTitle(),
    emptyTile: tile("new-empty", "plus"),
    fileTile: tile("new-file", "import"),
    fileInput: element("input", {
      className: "visually-hidden",
      attributes: { type: "file", accept: IMPORT_FILE_ACCEPT, tabindex: "-1" },
    }),
    formHost: element("div", { className: "welcome-form-host" }),
    recentTitle: sectionTitle(),
    cards: element("div", { className: "welcome-cards" }),
    recentEmpty: element("p", { className: "pane-empty" }),
    resourcesTitle: sectionTitle(),
    links: LINKS.map(({ label, href }) => ({ label, anchor: linkElement(href) })),
    shortcutsTitle: element("h4", { className: "welcome-section__subtitle" }),
    shortcuts: element("ul", { className: "welcome-shortcuts" }),
  };
  return { ...parts, root: assemble(parts) };
}

function listen(parts: Parts, current: { intents: PanelIntents | null }): void {
  const { root, fileInput } = parts;
  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const exampleId = target?.closest("[data-example-id]")?.getAttribute("data-example-id");
    const pantinId = target?.closest("[data-pantin-id]")?.getAttribute("data-pantin-id");
    const action = target?.closest("[data-action]")?.getAttribute("data-action");
    if (exampleId) {
      current.intents?.toggleExamplePrompt(exampleId);
    } else if (pantinId) {
      current.intents?.openPantin(pantinId);
    } else if (action === "new-empty") {
      current.intents?.toggleCreatePantin();
    } else if (action === "new-file") {
      // Inside the click: the browser only opens a file picker for a user gesture.
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file !== undefined) {
      current.intents?.createPantinFromFile(file);
    }
    // Lets the user pick the same file again after an error.
    fileInput.value = "";
  });
}

function setTileLabel(tileButton: HTMLElement, text: string): void {
  const label = tileButton.querySelector(".welcome-tile__label");
  if (label !== null) {
    label.textContent = text;
  }
}

function renderLink(link: HTMLAnchorElement, label: string, newTab: string): void {
  const [text, hint] = link.children;
  if (text !== undefined && hint !== undefined) {
    text.textContent = label;
    hint.textContent = ` ${newTab}`;
  }
}

function shortcutItem(entry: { keys: string; action: string }): HTMLElement {
  return element("li", { className: "welcome-shortcut" }, [
    element("kbd", { className: "welcome-shortcut__keys", text: entry.keys }),
    element("span", { text: entry.action }),
  ]);
}

export function createWelcomeHome(): WelcomeHome {
  const parts = buildParts();
  const current: { intents: PanelIntents | null } = { intents: null };
  let kept = new Map<string, HTMLElement>();
  let keptExamples = new Map<string, HTMLElement>();
  listen(parts, current);
  return {
    element: parts.root,
    render: (view, translate, intents) => {
      current.intents = intents;
      parts.newTitle.textContent = translate("welcome.new");
      setTileLabel(parts.emptyTile, translate("welcome.new.empty"));
      setTileLabel(parts.fileTile, translate("welcome.new.fromFile"));
      parts.emptyTile.setAttribute("aria-pressed", String(view.creating));
      parts.fileInput.setAttribute("aria-label", translate("welcome.new.fromFile"));
      showNamePrompt(
        parts.formHost,
        parts.emptyTile,
        view.creating ? { key: "create", prompt: createPrompt(translate, intents) } : null,
        translate,
      );
      keptExamples = showExamples(
        parts.examples,
        keptExamples,
        view,
        translate,
        intents,
        parts.emptyTile,
      );
      parts.recentTitle.textContent = translate("welcome.recent");
      parts.recentEmpty.textContent = translate("welcome.recent.empty");
      parts.recentEmpty.hidden = view.recents.length > 0;
      kept = updateCards(parts.cards, kept, view.recents, cardElement);
      parts.resourcesTitle.textContent = translate("welcome.resources");
      for (const { label, anchor } of parts.links) {
        renderLink(anchor, translate(label), translate("welcome.link.newTab"));
      }
      parts.shortcutsTitle.textContent = translate("welcome.shortcuts");
      parts.shortcuts.replaceChildren(...view.shortcuts.map(shortcutItem));
    },
  };
}
