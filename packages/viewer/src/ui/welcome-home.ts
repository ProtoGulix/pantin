import type { MessageKey, Translate } from "../i18n/translate.ts";
import { IMPORT_FILE_ACCEPT } from "../import-options.ts";
import type { RecentCardView, WelcomeView } from "../panel/welcome-model.ts";
import { committingTextInput, element, iconButton } from "./dom.ts";
import { icon } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The "Home" tab of the welcome dialog: New, Recent, Resources (ADR 0027).
// Built once and redrawn in place; a recent card is kept across redraws (a
// card rebuilt between the press and the release would lose the click), and
// clicks are handled by delegation.

export interface WelcomeHome {
  element: HTMLElement;
  render(view: WelcomeView, translate: Translate, intents: PanelIntents): void;
}

const REPOSITORY = "https://github.com/ProtoGulix/pantin";
const LINKS: readonly { label: MessageKey; href: string }[] = [
  { label: "welcome.link.repository", href: REPOSITORY },
  { label: "welcome.link.guides", href: `${REPOSITORY}/tree/master/docs/guides` },
  { label: "welcome.link.decisions", href: `${REPOSITORY}/tree/master/docs/decisions` },
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

function renderCreatePantinForm(translate: Translate, intents: PanelIntents): HTMLElement {
  const input = committingTextInput("", {
    label: translate("create.label"),
    focusKey: "create-pantin",
    onCommit: (name) => intents.createPantin(name),
    onCancel: () => intents.toggleCreatePantin(),
    commitOnBlur: false,
  });
  input.placeholder = translate("create.label");
  return element(
    "div",
    {
      className: "inline-form inline-form--row welcome-create",
      attributes: { role: "group", "aria-label": translate("welcome.new.empty") },
    },
    [
      input,
      iconButton("check", translate("create.confirm"), () => intents.createPantin(input.value)),
      iconButton("close", translate("create.cancel"), intents.toggleCreatePantin),
    ],
  );
}

function cardElement(card: RecentCardView): HTMLElement {
  return element(
    "button",
    { className: "welcome-card", attributes: { type: "button", "data-pantin-id": card.id } },
    [
      icon("pantin", "icon welcome-card__icon"),
      element("span", { className: "welcome-card__name", text: card.name }),
      element("span", { className: "welcome-card__detail", text: card.bodies }),
      element("span", { className: "welcome-card__detail", text: card.modified }),
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
  const parts = {
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
    const pantinId = target?.closest("[data-pantin-id]")?.getAttribute("data-pantin-id");
    const action = target?.closest("[data-action]")?.getAttribute("data-action");
    if (pantinId) {
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

// The name prompt lives as long as the question is open, so typing survives redraws.
function showCreateForm(
  host: HTMLElement,
  tile: HTMLElement,
  creating: boolean,
  translate: Translate,
  intents: PanelIntents,
): void {
  if (!creating) {
    // The field held the focus (Escape, Create): it goes back to the tile
    // that opened it rather than to the page.
    const hadFocus = host.contains(document.activeElement);
    host.replaceChildren();
    if (hadFocus) {
      tile.focus();
    }
  } else if (host.childElementCount === 0) {
    const form = renderCreatePantinForm(translate, intents);
    host.append(form);
    form.querySelector("input")?.focus();
  }
}

// Cards by what they show: an unchanged card is the same element as before.
function updateCards(
  container: HTMLElement,
  kept: ReadonlyMap<string, HTMLElement>,
  recents: readonly RecentCardView[],
): Map<string, HTMLElement> {
  const next = new Map<string, HTMLElement>();
  const ordered = recents.map((card) => {
    const signature = JSON.stringify(card);
    const cardButton = kept.get(signature) ?? cardElement(card);
    next.set(signature, cardButton);
    return cardButton;
  });
  const unchanged =
    ordered.length === container.children.length &&
    ordered.every((cardButton, index) => container.children[index] === cardButton);
  if (!unchanged) {
    container.replaceChildren(...ordered);
  }
  return next;
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
      showCreateForm(parts.formHost, parts.emptyTile, view.creating, translate, intents);
      parts.recentTitle.textContent = translate("welcome.recent");
      parts.recentEmpty.textContent = translate("welcome.recent.empty");
      parts.recentEmpty.hidden = view.recents.length > 0;
      kept = updateCards(parts.cards, kept, view.recents);
      parts.resourcesTitle.textContent = translate("welcome.resources");
      for (const { label, anchor } of parts.links) {
        renderLink(anchor, translate(label), translate("welcome.link.newTab"));
      }
      parts.shortcutsTitle.textContent = translate("welcome.shortcuts");
      parts.shortcuts.replaceChildren(...view.shortcuts.map(shortcutItem));
    },
  };
}
