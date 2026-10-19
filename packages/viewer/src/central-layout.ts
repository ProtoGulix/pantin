// The central area (ADR 0030 point 7, ADR 0049 point 11, ADR 0059 amendment "one view selector
// per zone"): a top zone and an optional bottom zone, each showing one of four views, never the
// same view twice. Pure: the UI and the store only ask. The layout is a setting of the viewer kept
// in the browser, so a stored text is untrusted and falls back.

export type CentralView = "3d" | "diagram" | "joints" | "io";
export type Zone = "top" | "bottom";

export interface CentralLayout {
  readonly top: CentralView;
  readonly bottom: CentralView | null;
}

/** The order of the selectors, of F4 and of the menu. */
export const CENTRAL_VIEWS: readonly CentralView[] = ["3d", "diagram", "joints", "io"];

export const DEFAULT_CENTRAL_LAYOUT: CentralLayout = { top: "3d", bottom: "diagram" };

export function layoutOf(top: CentralView, bottom: CentralView | null = null): CentralLayout {
  return { top, bottom };
}

function viewOfZone(layout: CentralLayout, zone: Zone): CentralView | null {
  return zone === "top" ? layout.top : layout.bottom;
}

const otherZone = (zone: Zone): Zone => (zone === "top" ? "bottom" : "top");

const showsView = (layout: CentralLayout, view: CentralView): boolean =>
  layout.top === view || layout.bottom === view;
export const showsViewport = (layout: CentralLayout): boolean => showsView(layout, "3d");
export const showsDiagram = (layout: CentralLayout): boolean => showsView(layout, "diagram");
export const showsJointStar = (layout: CentralLayout): boolean => showsView(layout, "joints");
export const showsIo = (layout: CentralLayout): boolean => showsView(layout, "io");
/** The splitter is there while the bottom zone is open. */
export const isSplitLayout = (layout: CentralLayout): boolean => layout.bottom !== null;

/** The zone that shows a view, or "none": a view in no zone is hidden, not just covered. */
export function zoneOfView(layout: CentralLayout, view: CentralView): Zone | "none" {
  return layout.top === view ? "top" : layout.bottom === view ? "bottom" : "none";
}

/** A view shown in the other zone cannot be chosen here: the choice is refused, not swapped. */
export function isViewDisabledIn(layout: CentralLayout, zone: Zone, view: CentralView): boolean {
  return viewOfZone(layout, otherZone(zone)) === view;
}

/** Puts `view` in `zone`; unchanged when the other zone shows it. Choosing it in a closed bottom opens it. */
export function chooseView(layout: CentralLayout, zone: Zone, view: CentralView): CentralLayout {
  if (isViewDisabledIn(layout, zone, view)) {
    return layout;
  }
  return zone === "top" ? { ...layout, top: view } : { ...layout, bottom: view };
}

/** Makes sure a view shows somewhere, in the top zone when it shows in none. */
export function revealView(layout: CentralLayout, view: CentralView): CentralLayout {
  return showsView(layout, view) ? layout : chooseView(layout, "top", view);
}

/** Opens the bottom zone on the first view the top zone does not show; no-op when open. */
export function openBottomZone(layout: CentralLayout): CentralLayout {
  if (layout.bottom !== null) {
    return layout;
  }
  const first = CENTRAL_VIEWS.find((view) => view !== layout.top);
  return first === undefined ? layout : { ...layout, bottom: first };
}

export function closeBottomZone(layout: CentralLayout): CentralLayout {
  return { top: layout.top, bottom: null };
}

/** F4: the top zone moves to the next view in the order, skipping the one the bottom zone shows. */
export function nextTopView(layout: CentralLayout): CentralLayout {
  const start = CENTRAL_VIEWS.indexOf(layout.top);
  for (let step = 1; step < CENTRAL_VIEWS.length; step += 1) {
    const candidate = CENTRAL_VIEWS[(start + step) % CENTRAL_VIEWS.length];
    if (candidate !== undefined && candidate !== layout.bottom) {
      return { ...layout, top: candidate };
    }
  }
  return layout;
}

/** With no Pantin open nothing but the empty 3D view makes sense: it takes the whole area. */
export function effectiveLayout(layout: CentralLayout, pantinOpen: boolean): CentralLayout {
  return pantinOpen ? layout : layoutOf("3d");
}

/**
 * The Babylon.js render loop runs whenever the 3D view is shown, in either zone (ADR 0030
 * point 8). With no Pantin open the empty 3D view keeps rendering.
 */
export function shouldRender(layout: CentralLayout, pantinOpen: boolean): boolean {
  return showsViewport(layout) || !pantinOpen;
}

// The stored text is the top view, then "/" and the bottom view when it is open. A lone
// view reads as the old value of the same name; the other old values are listed here.
const OLD_LAYOUTS: Readonly<Record<string, CentralLayout>> = {
  both: layoutOf("3d", "diagram"),
  "3d-joints": layoutOf("3d", "joints"),
};

/** A view named by a plain text (a menu command, a stored value), or null. */
export function parseCentralView(text: string | undefined): CentralView | null {
  return CENTRAL_VIEWS.find((view) => view === text) ?? null;
}

export function parseStoredLayout(text: string | null): CentralLayout {
  if (text === null) {
    return DEFAULT_CENTRAL_LAYOUT;
  }
  const old = OLD_LAYOUTS[text];
  if (old !== undefined) {
    return old;
  }
  const [topText, bottomText, ...rest] = text.split("/");
  const top = parseCentralView(topText);
  const bottom = bottomText === undefined ? null : parseCentralView(bottomText);
  const wellFormed =
    top !== null && rest.length === 0 && (bottomText === undefined || bottom !== null);
  return wellFormed && top !== bottom ? layoutOf(top, bottom) : DEFAULT_CENTRAL_LAYOUT;
}

export function serialiseLayout(layout: CentralLayout): string {
  return layout.bottom === null ? layout.top : `${layout.top}/${layout.bottom}`;
}
