// The four layouts of the central area (ADR 0030 point 7, ADR 0049 point 11) and what each one
// implies. Pure: the UI and the store only ask. The layout is a setting of the
// viewer kept in the browser, so a stored text is untrusted and falls back.

export type CentralLayout = "3d" | "diagram" | "both" | "io";

export const CENTRAL_LAYOUTS: readonly CentralLayout[] = ["3d", "diagram", "both", "io"];
export const DEFAULT_CENTRAL_LAYOUT: CentralLayout = "both";

export function parseStoredLayout(text: string | null): CentralLayout {
  return CENTRAL_LAYOUTS.find((layout) => layout === text) ?? DEFAULT_CENTRAL_LAYOUT;
}

export const showsViewport = (layout: CentralLayout): boolean =>
  layout !== "diagram" && layout !== "io";
export const showsDiagram = (layout: CentralLayout): boolean =>
  layout === "diagram" || layout === "both";
export const showsIo = (layout: CentralLayout): boolean => layout === "io";

/**
 * F4: both, then the 3D view alone, then the diagram alone, then both again.
 * The I/O view is left out of the cycle: it is a table to work in, not a way
 * of looking at the machine, so it is chosen on purpose and F4 leaves it for "both".
 */
export function nextLayout(layout: CentralLayout): CentralLayout {
  const order: readonly CentralLayout[] = ["both", "3d", "diagram"];
  const index = order.indexOf(layout);
  return order[(index + 1) % order.length] ?? DEFAULT_CENTRAL_LAYOUT;
}

/** With no Pantin open the diagram has nothing to draw: the 3D view takes the whole area. */
export function effectiveLayout(layout: CentralLayout, pantinOpen: boolean): CentralLayout {
  return pantinOpen ? layout : "3d";
}

/**
 * The Babylon.js render loop runs whenever the 3D view is shown, alone or
 * above the diagram (ADR 0030 point 8). With no Pantin open the diagram has
 * nothing to show, so the empty 3D view keeps rendering.
 */
export function shouldRender(layout: CentralLayout, pantinOpen: boolean): boolean {
  return showsViewport(layout) || !pantinOpen;
}
