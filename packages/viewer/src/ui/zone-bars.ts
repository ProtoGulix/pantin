import {
  CENTRAL_VIEWS,
  type CentralLayout,
  type CentralView,
  isViewDisabledIn,
  type Zone,
} from "../central-layout.ts";
import type { Translate } from "../i18n/translate.ts";
import { element, iconButton } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The selector row in the top left corner of each zone of the central area (ADR 0059
// amendment): a segmented control with the four views, alone in its row (ADR 0057 rule 5),
// the active view marked in the brand colour and by aria-pressed. The view the other zone shows
// is disabled, with the reason in its tooltip and accessible name. The top row also holds the
// button that opens the bottom zone, the bottom row the one that closes it. The buttons stay
// in place from one render to the next, so a click never loses the keyboard focus.

const VIEW_LABEL_KEYS = {
  "3d": "view.3d",
  diagram: "view.diagram",
  joints: "view.joints",
  io: "view.io",
} as const;

class ZoneBar {
  readonly root: HTMLElement;
  private readonly buttons = new Map<CentralView, HTMLButtonElement>();
  private readonly action: HTMLButtonElement;
  private readonly zone: Zone;

  constructor(zone: Zone, choose: (view: CentralView) => void, onAction: () => void) {
    this.zone = zone;
    const segments = CENTRAL_VIEWS.map((view) => {
      const button = element("button", {
        className: "zone-bar__button",
        attributes: { type: "button" },
      });
      button.addEventListener("click", () => choose(view));
      this.buttons.set(view, button);
      return button;
    });
    this.action = iconButton(zone === "top" ? "plus" : "close", "", onAction);
    this.action.classList.add("zone-bar__action");
    this.root = element(
      "div",
      { className: `zone-bar zone-bar--${zone}`, attributes: { role: "group" } },
      [element("div", { className: "zone-bar__views" }, segments), this.action],
    );
  }

  render(layout: CentralLayout, translate: Translate, visible: boolean): void {
    const shown = visible && (this.zone === "top" || layout.bottom !== null);
    this.root.hidden = !shown;
    if (!shown) {
      return;
    }
    this.root.setAttribute("aria-label", translate(`zone.${this.zone}.label`));
    for (const [view, button] of this.buttons) {
      this.renderButton(button, view, layout, translate);
    }
    // The top row offers to open the bottom zone only while it is closed.
    const label = translate(this.zone === "top" ? "zone.openBottom" : "zone.closeBottom");
    this.action.hidden = this.zone === "top" && layout.bottom !== null;
    this.action.title = label;
    this.action.setAttribute("aria-label", label);
  }

  private renderButton(
    button: HTMLButtonElement,
    view: CentralView,
    layout: CentralLayout,
    translate: Translate,
  ): void {
    const name = translate(VIEW_LABEL_KEYS[view]);
    const pressed = (this.zone === "top" ? layout.top : layout.bottom) === view;
    const disabled = isViewDisabledIn(layout, this.zone, view);
    const label = disabled ? translate("zone.viewDisabled", { view: name }) : name;
    button.textContent = name;
    button.disabled = disabled;
    button.classList.toggle("is-pressed", pressed);
    button.setAttribute("aria-pressed", String(pressed));
    button.title = label;
    button.setAttribute("aria-label", label);
  }
}

export class ZoneBars {
  private readonly top: ZoneBar;
  private readonly bottom: ZoneBar;
  private intents: PanelIntents | null = null;

  // The rows go in the central area, under `before` (the welcome overlay).
  constructor(area: HTMLElement, before: HTMLElement) {
    const choose = (zone: Zone) => (view: CentralView) => this.intents?.chooseZoneView(zone, view);
    this.top = new ZoneBar("top", choose("top"), () => this.intents?.openBottomZone());
    this.bottom = new ZoneBar("bottom", choose("bottom"), () => this.intents?.closeBottomZone());
    area.insertBefore(this.top.root, before);
    area.insertBefore(this.bottom.root, before);
  }

  /** `visible` is false outside the edit view, where there is one empty 3D view and nothing to choose. */
  render(
    layout: CentralLayout,
    translate: Translate,
    visible: boolean,
    intents: PanelIntents,
  ): void {
    this.intents = intents;
    this.top.render(layout, translate, visible);
    this.bottom.render(layout, translate, visible);
  }
}
