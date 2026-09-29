import type { Translate } from "../i18n/translate.ts";
import {
  clampPanelWidth,
  clampTreeFraction,
  PANEL_WIDTH_DEFAULT,
  parseStoredNumber,
  TREE_FRACTION_DEFAULT,
} from "../layout-sizes.ts";
import { readStoredText, STORAGE_KEYS, writeStoredText } from "./browser-storage.ts";
import { createSplitter } from "./splitter.ts";

// Resizable panes: panel width against the 3D view, and tree height against
// the properties. Sizes are CSS variables, remembered in the browser.

export interface PaneLayoutElements {
  layoutRoot: HTMLElement;
  panel: HTMLElement;
  // The two stacked panes inside the panel, and the container holding both.
  paneStack: HTMLElement;
  treePane: HTMLElement;
}

export interface PaneLayout {
  treeSplitter: HTMLElement;
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

function setUpTreeSplit(elements: PaneLayoutElements): HTMLElement {
  const { paneStack, treePane } = elements;
  const apply = (fraction: number) =>
    paneStack.style.setProperty("--tree-fraction", String(fraction));
  let fraction = clampTreeFraction(
    parseStoredNumber(readStoredText(STORAGE_KEYS.treeFraction), TREE_FRACTION_DEFAULT),
  );
  let startFraction = fraction;
  apply(fraction);
  const splitter = createSplitter({
    orientation: "horizontal",
    onStart: () => {
      startFraction = fraction;
    },
    onMove: (delta) => {
      fraction = clampTreeFraction(startFraction + delta / Math.max(paneStack.clientHeight, 1));
      apply(fraction);
    },
    onEnd: () => writeStoredText(STORAGE_KEYS.treeFraction, String(fraction)),
  });
  treePane.after(splitter);
  return splitter;
}

export function setUpPaneLayout(elements: PaneLayoutElements): PaneLayout {
  const panelSplitter = setUpPanelWidth(elements);
  const treeSplitter = setUpTreeSplit(elements);
  return {
    treeSplitter,
    translateLabels: (translate) => {
      panelSplitter.setAttribute("aria-label", translate("splitter.panel"));
      panelSplitter.title = translate("splitter.panel");
      treeSplitter.setAttribute("aria-label", translate("splitter.properties"));
      treeSplitter.title = translate("splitter.properties");
    },
  };
}
