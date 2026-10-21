import type { ExternalEditBannerView } from "../external-edits/external-edit-model.ts";
import { button, element } from "./dom.ts";
import { icon } from "./icons.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The warning at the top of the central area while a file of the Pantin changed outside
// Pantin (ADR 0063 point 5). The glyph, the words and the border carry the warning, so
// the amber tint is never the only cue (ADR 0057). The host is a role="status" region.

export class ExternalEditBanner {
  private readonly host: HTMLElement;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  render(view: ExternalEditBannerView | null, intents: PanelIntents): void {
    this.host.hidden = view === null;
    if (view === null) {
      this.host.replaceChildren();
      return;
    }
    this.host.replaceChildren(
      element(
        "span",
        { className: "external-edit-banner__glyph", attributes: { title: view.glyphLabel } },
        [icon("warning"), element("span", { className: "visually-hidden", text: view.glyphLabel })],
      ),
      element("span", { className: "external-edit-banner__text", text: view.text }),
      button(view.reloadLabel, "button external-edit-banner__action", intents.reloadFromDisk),
    );
  }
}
