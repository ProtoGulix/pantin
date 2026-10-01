import type { Translate } from "../i18n/translate.ts";
import { clampPanelWidth, PANEL_WIDTH_DEFAULT, parseStoredNumber } from "../layout-sizes.ts";
import { readStoredText, STORAGE_KEYS, writeStoredText } from "./browser-storage.ts";
import { createSplitter } from "./splitter.ts";

// The resizable left panel: its width against the 3D view. The size is a CSS
// variable, remembered in the browser.

export interface PaneLayoutElements {
  layoutRoot: HTMLElement;
  panel: HTMLElement;
}

export interface PaneLayout {
  translateLabels(translate: Translate): void;
}

function setUpPanelWidth(elements: PaneLayoutElements): HTMLElement {
  const { layoutRoot, panel } = elements;
  const apply = (width: number) => layoutRoot.style.setProperty("--panel-width", `${width}px`);
  let width = clampPanelWidth(
    parseStoredNumber(readStoredText(STORAGE_KEYS.panelWidth), PANEL_WIDTH_DEFAULT),
    window.innerWidth,
  );
  let startWidth = width;
  apply(width);
  const splitter = createSplitter({
    orientation: "vertical",
    onStart: () => {
      startWidth = width;
    },
    onMove: (delta) => {
      width = clampPanelWidth(startWidth + delta, window.innerWidth);
      apply(width);
    },
    onEnd: () => writeStoredText(STORAGE_KEYS.panelWidth, String(width)),
  });
  panel.after(splitter);
  return splitter;
}

export function setUpPaneLayout(elements: PaneLayoutElements): PaneLayout {
  const panelSplitter = setUpPanelWidth(elements);
  return {
    translateLabels: (translate) => {
      panelSplitter.setAttribute("aria-label", translate("splitter.panel"));
      panelSplitter.title = translate("splitter.panel");
    },
  };
}
