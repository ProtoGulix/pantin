import type { Translate } from "../i18n/translate.ts";
import type { MessageView } from "../view-model.ts";
import { element, iconButton } from "./dom.ts";
import { icon } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";

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
        element("div", { className: "message-line__text", text: message.text }),
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
