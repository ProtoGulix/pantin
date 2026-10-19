import type { CentralView } from "../central-layout.ts";

// How a view announces itself to the central area, which places it in a zone with CSS
// (central-area.ts, styles/zones.css). The 3D canvas takes the whole zone; the other views
// start under the zone's selector row, so that the selector never covers their content.

export function markAsZoneView(host: HTMLElement, view: CentralView): void {
  host.dataset.centralView = view;
  host.classList.add("zone-view");
  if (view !== "3d") {
    host.classList.add("zone-view--panel");
  }
}
