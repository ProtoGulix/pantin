import {
  type CentralLayout,
  isSplitLayout,
  parseCentralView,
  zoneOfView,
} from "../central-layout.ts";
import type { Translate } from "../i18n/translate.ts";
import {
  clampSplitRatio,
  parseStoredNumber,
  SPLIT_RATIO_DEFAULT,
  splitRatioAfterMove,
} from "../layout-sizes.ts";
import { readStoredText, STORAGE_KEYS, writeStoredText } from "./browser-storage.ts";
import { createSplitter } from "./splitter.ts";

// The central area (ADR 0030 point 7, ADR 0059 amendment): a top zone and, when the bottom
// zone is open, a horizontal splitter and the bottom zone. Every view marks itself with
// data-central-view (zone-view.ts) and takes its place from a zone class set here, so the 3D
// canvas keeps its element and the diagram its scroll when a view changes zone; the engine
// follows the canvas size through the ResizeObserver of scene/viewport.ts, which also covers
// every splitter move.

export class CentralArea {
  private readonly splitter: HTMLElement;
  // The stored share is kept as read: clamping depends on the height at hand.
  private ratio = parseStoredNumber(readStoredText(STORAGE_KEYS.splitRatio), SPLIT_RATIO_DEFAULT);
  private startRatio = this.ratio;

  private readonly area: HTMLElement;

  constructor(area: HTMLElement) {
    this.area = area;
    this.splitter = createSplitter({
      orientation: "horizontal",
      onStart: () => {
        // From what is on screen: a stored ratio may be out of range here.
        this.startRatio = clampSplitRatio(this.ratio, this.area.clientHeight);
      },
      onMove: (delta) => {
        this.ratio = splitRatioAfterMove(this.startRatio, delta, this.area.clientHeight);
        this.applyRatio();
      },
      onEnd: () => writeStoredText(STORAGE_KEYS.splitRatio, String(this.ratio)),
      onReset: () => {
        this.ratio = SPLIT_RATIO_DEFAULT;
        this.applyRatio();
        writeStoredText(STORAGE_KEYS.splitRatio, String(this.ratio));
      },
    });
    this.splitter.classList.add("central-splitter");
    this.splitter.setAttribute("aria-valuemin", "0");
    this.splitter.setAttribute("aria-valuemax", "100");
    area.append(this.splitter);
    // The clamp depends on the height, so a window resize may move the split.
    new ResizeObserver(() => this.applyRatio()).observe(area);
    this.applyRatio();
  }

  render(layout: CentralLayout, translate: Translate): void {
    this.area.classList.toggle("viewport--split", isSplitLayout(layout));
    // Read by the overlays that follow the 3D view (hint, view cube) in styles/zones.css.
    this.area.dataset.top3d = String(layout.top === "3d");
    this.area.dataset.bottom3d = String(layout.bottom === "3d");
    for (const host of this.area.querySelectorAll<HTMLElement>("[data-central-view]")) {
      placeInZone(host, layout);
    }
    this.splitter.hidden = !isSplitLayout(layout);
    this.splitter.setAttribute("aria-label", translate("splitter.central"));
    this.splitter.title = translate("splitter.central");
    this.applyRatio();
  }

  private applyRatio(): void {
    const shown = clampSplitRatio(this.ratio, this.area.clientHeight);
    this.area.style.setProperty("--split", `${shown * 100}%`);
    this.splitter.setAttribute("aria-valuenow", String(Math.round(shown * 100)));
  }
}

// A view in no zone is out of sight (styles/zones.css): the 3D canvas is display:none there, so
// the browser neither lays it out nor keeps a large WebGL surface to composite. Its engine is not
// resized to nothing (scene/viewport.ts) and follows the canvas again when it comes back.
function placeInZone(host: HTMLElement, layout: CentralLayout): void {
  const view = parseCentralView(host.dataset.centralView);
  const zone = view === null ? "none" : zoneOfView(layout, view);
  host.classList.toggle("zone-view--top", zone === "top");
  host.classList.toggle("zone-view--bottom", zone === "bottom");
  host.classList.toggle("zone-view--none", zone === "none");
}
