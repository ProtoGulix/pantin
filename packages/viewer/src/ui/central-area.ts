import { CENTRAL_LAYOUTS, type CentralLayout } from "../central-layout.ts";
import type { Translate } from "../i18n/translate.ts";
import {
  clampSplitRatio,
  parseStoredNumber,
  SPLIT_RATIO_DEFAULT,
  splitRatioAfterMove,
} from "../layout-sizes.ts";
import { readStoredText, STORAGE_KEYS, writeStoredText } from "./browser-storage.ts";
import { createSplitter } from "./splitter.ts";

// The central area (ADR 0030 point 7): a class for the layout, and in "both"
// a horizontal splitter between the 3D view and the diagram. The canvas keeps
// its element and the diagram its scroll, so a switch loses neither the camera
// nor the diagram's place; the engine follows the canvas size through the
// ResizeObserver of viewport.ts, which also covers every splitter move.

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
    for (const name of CENTRAL_LAYOUTS) {
      this.area.classList.toggle(`viewport--${name}`, name === layout);
    }
    this.splitter.hidden = layout !== "both";
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
