import type { Translate } from "../i18n/translate.ts";
import {
  type ColumnWidths,
  clampColumns,
  INSPECTOR_WIDTH_DEFAULT,
  PANEL_WIDTH_DEFAULT,
  parseStoredNumber,
} from "../layout-sizes.ts";
import { readStoredText, STORAGE_KEYS, writeStoredText } from "./browser-storage.ts";
import { createSplitter } from "./splitter.ts";

// The resizable side columns: the left panel and the inspector, against the
// 3D view. Sizes are CSS variables, remembered in the browser. The wanted
// widths are kept apart from the shown ones: a narrow window only squeezes
// the display, and a wider one gives the wanted widths back.

export interface PaneLayoutElements {
  layoutRoot: HTMLElement;
  panel: HTMLElement;
}

export interface PaneLayout {
  translateLabels(translate: Translate): void;
}

type Column = keyof ColumnWidths;

const COLUMN_SETTINGS: Record<Column, { variable: string; key: string; initial: number }> = {
  panel: {
    variable: "--panel-width",
    key: STORAGE_KEYS.panelWidth,
    initial: PANEL_WIDTH_DEFAULT,
  },
  inspector: {
    variable: "--inspector-width",
    key: STORAGE_KEYS.inspectorWidth,
    initial: INSPECTOR_WIDTH_DEFAULT,
  },
};

interface ColumnState {
  wanted: ColumnWidths;
  apply(): ColumnWidths;
}

function splitterFor(state: ColumnState, column: Column, direction: 1 | -1): HTMLElement {
  const { key, initial } = COLUMN_SETTINGS[column];
  let start = state.wanted[column];
  return createSplitter({
    orientation: "vertical",
    // The drag starts from the width shown, not from a squeezed-away wish.
    onStart: () => {
      start = state.apply()[column];
    },
    onMove: (delta) => {
      state.wanted[column] = start + direction * delta;
      state.apply();
    },
    onEnd: () => writeStoredText(key, String(state.apply()[column])),
    onReset: () => {
      state.wanted[column] = initial;
      state.apply();
      writeStoredText(key, String(initial));
    },
  });
}

function createColumnState(layoutRoot: HTMLElement, inspector: Element | null): ColumnState {
  const wanted: ColumnWidths = {
    panel: parseStoredNumber(readStoredText(STORAGE_KEYS.panelWidth), PANEL_WIDTH_DEFAULT),
    inspector: parseStoredNumber(
      readStoredText(STORAGE_KEYS.inspectorWidth),
      INSPECTOR_WIDTH_DEFAULT,
    ),
  };
  const apply = (): ColumnWidths => {
    const open = !(inspector instanceof HTMLElement && inspector.hidden);
    const shown = clampColumns(wanted, window.innerWidth, open);
    for (const column of ["panel", "inspector"] as const) {
      layoutRoot.style.setProperty(COLUMN_SETTINGS[column].variable, `${shown[column]}px`);
    }
    return shown;
  };
  return { wanted, apply };
}

function setUpColumns(
  layoutRoot: HTMLElement,
  panel: HTMLElement,
): { panelSplitter: HTMLElement; inspectorSplitter: HTMLElement } {
  const inspector = layoutRoot.querySelector("#inspector");
  const state = createColumnState(layoutRoot, inspector);
  state.apply();
  window.addEventListener("resize", state.apply);
  // Opening or closing the inspector changes what the 3D view has left.
  if (inspector !== null) {
    new MutationObserver(state.apply).observe(inspector, {
      attributes: true,
      attributeFilter: ["hidden"],
    });
  }
  const panelSplitter = splitterFor(state, "panel", 1);
  panel.after(panelSplitter);
  // The inspector's own edge: dragging left makes it wider.
  const inspectorSplitter = splitterFor(state, "inspector", -1);
  inspectorSplitter.classList.add("splitter--inspector");
  inspector?.before(inspectorSplitter);
  return { panelSplitter, inspectorSplitter };
}

export function setUpPaneLayout(elements: PaneLayoutElements): PaneLayout {
  const { panelSplitter, inspectorSplitter } = setUpColumns(elements.layoutRoot, elements.panel);
  return {
    translateLabels: (translate) => {
      panelSplitter.setAttribute("aria-label", translate("splitter.panel"));
      panelSplitter.title = translate("splitter.panel");
      inspectorSplitter.setAttribute("aria-label", translate("splitter.inspector"));
      inspectorSplitter.title = translate("splitter.inspector");
    },
  };
}
