import type { Translate } from "../i18n/translate.ts";
import type {
  ExampleCardView,
  ExamplePromptView,
  RecentCardView,
  WelcomeView,
} from "../panel/welcome-model.ts";
import { committingTextInput, element, iconButton } from "./dom.ts";
import { icon } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The pieces of the Home tab that are drawn in place: the name prompt shared
// by "Empty Pantin" and the example cards, and the cards (ADR 0027, 0062).

export interface NamePrompt {
  label: string;
  groupLabel: string;
  initialName: string;
  focusKey: string;
  onCommit(name: string): void;
  onCancel(): void;
}

// The one name prompt of the Home tab, for "Empty Pantin" and for an example (ADR 0027, 0062).
function renderNamePrompt(prompt: NamePrompt, translate: Translate): HTMLElement {
  const input = committingTextInput(prompt.initialName, {
    label: prompt.label,
    focusKey: prompt.focusKey,
    onCommit: prompt.onCommit,
    onCancel: prompt.onCancel,
    commitOnBlur: false,
  });
  input.placeholder = prompt.label;
  return element(
    "div",
    {
      className: "inline-form inline-form--row welcome-create",
      attributes: { role: "group", "aria-label": prompt.groupLabel },
    },
    [
      input,
      iconButton("check", translate("create.confirm"), () => prompt.onCommit(input.value)),
      iconButton("close", translate("create.cancel"), prompt.onCancel),
    ],
  );
}

export function createPrompt(translate: Translate, intents: PanelIntents): NamePrompt {
  return {
    label: translate("create.label"),
    groupLabel: translate("welcome.new.empty"),
    initialName: "",
    focusKey: "create-pantin",
    onCommit: (name) => intents.createPantin(name),
    onCancel: () => intents.toggleCreatePantin(),
  };
}

function examplePromptOf(
  view: ExamplePromptView,
  translate: Translate,
  intents: PanelIntents,
): NamePrompt {
  return {
    label: view.label,
    groupLabel: translate("welcome.examples"),
    initialName: view.initialName,
    focusKey: `copy-example-${view.exampleId}`,
    onCommit: (name) => intents.copyExample(name),
    onCancel: () => intents.toggleExamplePrompt(view.exampleId),
  };
}

export function cardElement(card: RecentCardView): HTMLElement {
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

// An example card has its own icon and the word "Example": it is not told apart by look alone.
function exampleCardElement(card: Omit<ExampleCardView, "asking">): HTMLElement {
  return element(
    "button",
    {
      className: "welcome-card welcome-card--example",
      attributes: {
        type: "button",
        "data-example-id": card.id,
      },
    },
    [
      icon("open", "icon welcome-card__icon"),
      element("span", { className: "welcome-card__name", text: card.name }),
      element("span", { className: "welcome-card__detail", text: card.bodies }),
      element("span", { className: "welcome-card__badge", text: card.badge }),
    ],
  );
}

// The name prompt lives as long as the question is open, so typing survives redraws.
// `key` names the question: another question rebuilds the prompt.
export function showNamePrompt(
  host: HTMLElement,
  returnFocusTo: HTMLElement,
  wanted: { key: string; prompt: NamePrompt } | null,
  translate: Translate,
): void {
  if (wanted === null) {
    // The field held the focus (Escape, Create): it goes back to the control
    // that opened it rather than to the page.
    const hadFocus = host.contains(document.activeElement);
    host.replaceChildren();
    host.removeAttribute("data-prompt-key");
    if (hadFocus) {
      returnFocusTo.focus();
    }
  } else if (host.getAttribute("data-prompt-key") !== wanted.key) {
    const form = renderNamePrompt(wanted.prompt, translate);
    host.replaceChildren(form);
    host.setAttribute("data-prompt-key", wanted.key);
    const input = form.querySelector("input");
    input?.focus();
    input?.select();
  }
}

// Cards by what they show: an unchanged card is the same element as before.
export function updateCards<Card>(
  container: HTMLElement,
  kept: ReadonlyMap<string, HTMLElement>,
  cards: readonly Card[],
  build: (card: Card) => HTMLElement,
): Map<string, HTMLElement> {
  const next = new Map<string, HTMLElement>();
  const ordered = cards.map((card) => {
    const signature = JSON.stringify(card);
    const cardButton = kept.get(signature) ?? build(card);
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

export interface ExamplesParts {
  section: HTMLElement;
  title: HTMLElement;
  cards: HTMLElement;
  promptHost: HTMLElement;
}

export function examplesParts(): ExamplesParts {
  const title = element("h3", { className: "welcome-section__title" });
  const cards = element("div", { className: "welcome-cards" });
  const promptHost = element("div", { className: "welcome-form-host" });
  const section = element("section", { className: "welcome-section" }, [title, cards, promptHost]);
  return { section, title, cards, promptHost };
}

/** The Examples section: hidden when empty, one card each, and the name prompt of the asked one. */
export function showExamples(
  parts: ExamplesParts,
  kept: ReadonlyMap<string, HTMLElement>,
  view: WelcomeView,
  translate: Translate,
  intents: PanelIntents,
  // Where focus goes when the asked card and every other card are gone: a title cannot take it.
  fallbackFocus: HTMLElement,
): Map<string, HTMLElement> {
  parts.section.hidden = view.examples.length === 0;
  parts.title.textContent = translate("welcome.examples");
  // `asking` is left out of the signature: the card keeps the focus when its prompt opens.
  const next = updateCards(
    parts.cards,
    kept,
    view.examples.map(({ asking: _asking, ...card }) => card),
    exampleCardElement,
  );
  for (const card of view.examples) {
    const cardButton = parts.cards.querySelector(`[data-example-id="${CSS.escape(card.id)}"]`);
    cardButton?.setAttribute("aria-pressed", String(card.asking));
  }
  // The prompt key is the example id: focus goes back to the card that opened it.
  const askedId = parts.promptHost.getAttribute("data-prompt-key") ?? "";
  const asked = parts.cards.querySelector(`[data-example-id="${CSS.escape(askedId)}"]`);
  showNamePrompt(
    parts.promptHost,
    asked instanceof HTMLElement
      ? asked
      : (parts.cards.querySelector<HTMLElement>("[data-example-id]") ?? fallbackFocus),
    view.examplePrompt === null
      ? null
      : {
          key: view.examplePrompt.exampleId,
          prompt: examplePromptOf(view.examplePrompt, translate, intents),
        },
    translate,
  );
  return next;
}
