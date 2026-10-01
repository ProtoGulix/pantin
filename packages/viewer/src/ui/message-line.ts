import type { Translate } from "../i18n/translate.ts";
import type { MessageLinkView, MessageView } from "../view-model.ts";
import { button, element, iconButton } from "./dom.ts";
import { icon } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";

// A device the message names: a click selects it, as any link of the inspector.
function messageLink(link: MessageLinkView, intents: PanelIntents): HTMLElement {
  return button(link.label, "message-line__link", () => intents.selectDevice(link.device));
}

// One compact line at the bottom of the panel with the latest message.

export function renderMessageLine(
  message: MessageView | null,
  translate: Translate,
  intents: PanelIntents,
): HTMLElement | null {
  if (message === null) {
    return null;
  }
  const role = message.level === "error" ? "alert" : "status";
  return element(
    "div",
    { className: `message-line message-line--${message.level}`, attributes: { role } },
    [
      element(
        "span",
        { className: "message-line__level", attributes: { title: message.levelLabel } },
        [
          icon(message.level),
          element("span", { className: "visually-hidden", text: message.levelLabel }),
        ],
      ),
      element("div", { className: "message-line__body" }, [
        element("div", { className: "message-line__text" }, [
          document.createTextNode(message.text),
          ...message.links.flatMap((link, index) => [
            document.createTextNode(index === 0 ? " " : ", "),
            messageLink(link, intents),
          ]),
        ]),
        message.detail === null
          ? null
          : element("div", {
              className: "message-line__detail",
              text: message.detail,
              attributes: { title: message.detail },
            }),
      ]),
      iconButton("close", translate("message.dismiss"), intents.dismissMessage),
    ],
  );
}
