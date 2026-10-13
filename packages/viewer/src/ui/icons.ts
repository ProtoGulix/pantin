import type { TreeIcon } from "../tree/tree-node.ts";

// Monochrome 16 x 16 line icons drawn with currentColor, so they follow the
// text colour of their row or button (muted, selected, disabled).

type ToolIcon =
  | "plus"
  | "back"
  | "open"
  | "save"
  | "import"
  | "frame-all"
  | "frame-selection"
  | "chevron"
  | "error"
  | "warning"
  | "info"
  | "close"
  | "check"
  | "eye"
  | "eye-off"
  | "bolt"
  | "sensor"
  | "play"
  | "pause"
  | "step"
  | "add-drive"
  | "add-actuator"
  | "add-sensor"
  | "add-belt"
  | "add-guide"
  | "add-emitter"
  | "add-absorber"
  | "add-presence-sensor"
  | "reset"
  | "move"
  | "rotate"
  | "gizmo-space"
  | "align"
  | "restore-placement"
  | "edit"
  | "delete";

export type IconName = TreeIcon | ToolIcon;

const CUBE = "M8 1.8 13.8 5v6L8 14.2 2.2 11V5Z M2.2 5 8 8.2 13.8 5 M8 8.2v6";
const CORNERS = "M2 5.5V2h3.5 M10.5 2H14v3.5 M14 10.5V14h-3.5 M5.5 14H2v-3.5";
// The small "+" in the top right corner of the icons that create a device.
const ADD_BADGE = "M12.5 1.5v4 M10.5 3.5h4";
// The shapes of the devices, without the "+" badge of the buttons that create them.
const DRIVE = "M1.5 7h10v6h-10Z M4.8 7v6 M8.2 7v6";
const ACTUATOR = "M1.5 7.5h8v5h-8Z M6 7.5v5 M6 10h8.5";
const SENSOR = "M1.5 8h4v4h-4Z M7.5 7.5a3 3 0 0 1 0 5 M9.8 6a5 5 0 0 1 0 8";
const BELT = "M4 7.5h7a2.5 2.5 0 0 1 0 5H4a2.5 2.5 0 0 1 0-5Z M4 10h7";
const GUIDE = "M1.5 12.5h13 M1.5 9.5h13 M1.5 9.5v3 M14.5 9.5v3 M4 7.5h4";
const EMITTER = "M1.5 3.5h6v6h-6Z M4.5 11v3 M3 12.5l1.5 1.5 1.5-1.5";
const ABSORBER = "M1.5 8.5h6v6h-6Z M4.5 2v5 M3 5.5 4.5 7 6 5.5";
const PRESENCE_SENSOR = "M1.5 8h3v4h-3Z M4.5 10h5 M13 10a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0Z";
const CIRCLE = "M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0Z";

const PATHS: Readonly<Record<IconName, string>> = {
  pantin: "M2 2.5h5v4H2Z M9 2.5h5v4H9Z M5.5 9.5h5v4h-5Z M4.5 6.5v3h3 M11.5 6.5v3h-3",
  folder: "M1.8 4.2v8.6h12.4V5.6H7.6L6.2 4.2Z",
  // Two parts held in one frame: an assembly of bodies.
  assembly: "M1.5 2.5h13v11h-13Z M3.5 5h4v6h-4Z M8.5 5h4v6h-4Z",
  "body-glb": CUBE,
  "body-stl": "M2 13.2 8 2.8l6 10.4Z M5 8 8 13.2 11 8Z",
  "body-step":
    "M3 4.5c0-1.1 2.2-2 5-2s5 .9 5 2v7c0 1.1-2.2 2-5 2s-5-.9-5-2Z M3 4.5c0 1.1 2.2 2 5 2s5-.9 5-2",
  joint: "M6 5a2 2 0 1 1-4 0a2 2 0 1 1 4 0Z M14 11a2 2 0 1 1-4 0a2 2 0 1 1 4 0Z M5.4 6.3 10.6 9.7",

  "device-drive": DRIVE,
  "device-actuator": ACTUATOR,
  "device-sensor": SENSOR,
  "device-belt": BELT,
  "device-guide": GUIDE,
  "device-emitter": EMITTER,
  "device-absorber": ABSORBER,
  "device-presence-sensor": PRESENCE_SENSOR,
  "source-node": "M2.5 8h3.5 M10 8a2 2 0 1 1-4 0a2 2 0 1 1 4 0Z",
  plus: "M8 3v10 M3 8h10",
  back: "M13 8H3.5 M7.5 4 3.5 8l4 4",
  open: "M2.5 8h8 M7 4.5 10.5 8 7 11.5 M13.5 2.5v11",
  save: "M2.5 2.5h9l2 2v9h-11Z M5 2.5V6h5V2.5 M4.5 13.5v-4h7v4",
  import: "M8 2v8 M5 7l3 3 3-3 M2.5 11v2.5h11V11",
  "frame-all": CORNERS,
  "frame-selection": `${CORNERS} M10 8a2 2 0 1 1-4 0a2 2 0 1 1 4 0Z`,
  chevron: "M6 3.5 10.5 8 6 12.5",
  error: `${CIRCLE} M8 4.5v4 M8 10.8v.7`,
  warning: "M8 2 14.5 13.5h-13Z M8 6.5v3.5 M8 11.6v.6",
  info: `${CIRCLE} M8 7.2v4 M8 4.8v.7`,
  close: "M4 4l8 8 M12 4l-8 8",
  check: "M3 8.5 6.5 12 13 4.5",
  // A lightning bolt: a drive moves this joint.
  bolt: "M9.5 1.5 4 9h4l-1.5 5.5L12 7H8Z",
  // A detector and its waves: a sensor watches this joint.
  sensor: "M2 6h4v4H2Z M8.5 5.5a3.5 3.5 0 0 1 0 5 M10.8 3.5a6.3 6.3 0 0 1 0 9",
  play: "M4.5 2.8 13 8l-8.5 5.2Z",
  pause: "M5 3v10 M11 3v10",
  // A play triangle and the bar it stops at: one step.
  step: "M3 3 10 8 3 13Z M13 3v10",
  // A valve block of three positions: a new drive.
  "add-drive": `${DRIVE} ${ADD_BADGE}`,
  // A cylinder and its rod: a new actuator.
  "add-actuator": `${ACTUATOR} ${ADD_BADGE}`,
  "add-sensor": `${SENSOR} ${ADD_BADGE}`,
  // A belt: a slab with its two drums.
  "add-belt": `${BELT} ${ADD_BADGE}`,
  // A rail along which products slide.
  "add-guide": `${GUIDE} ${ADD_BADGE}`,
  // A box with an arrow leaving it: products come out.
  "add-emitter": `${EMITTER} ${ADD_BADGE}`,
  // A box with an arrow entering it: products go in.
  "add-absorber": `${ABSORBER} ${ADD_BADGE}`,
  // A beam between an emitter and a target.
  "add-presence-sensor": `${PRESENCE_SENSOR} ${ADD_BADGE}`,
  // A circular arrow: back to the start.
  reset: "M3 8a5 5 0 1 0 1.5-3.6 M3 2.5v3h3",
  move: "M8 1.5v13 M1.5 8h13 M6 3.5l2-2 2 2 M6 12.5l2 2 2-2 M3.5 6l-2 2 2 2 M12.5 6l2 2-2 2",
  rotate: "M13 8a5 5 0 1 1-1.46-3.54 M11.6 1.6v2.9H8.7",
  // An arrow going back round: restore the previous placement.
  "restore-placement": "M2.5 8a5.5 5.5 0 1 1 1.6 3.9 M2.5 3.5V8H7",
  // Two blocks pushed against one line.
  align: "M2 2v12 M4.5 3.5h8v3h-8Z M4.5 9.5h5v3h-5Z",
  // A small trihedron: the axes the gizmo uses.
  "gizmo-space": "M3 13 8 8 M8 8V2.5 M8 8h5.5 M2 8.5l2-.5 M2.5 12l-.5-2",
  edit: "M10.5 2.5l3 3L6 13H3v-3Z M9 4l3 3",
  delete: "M2.5 4h11 M6 4V2.5h4V4 M4 4l.7 9.5h6.6L12 4 M6.8 6.5v5 M9.2 6.5v5",
  eye: "M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z M10 8a2 2 0 1 1-4 0a2 2 0 1 1 4 0Z",
  "eye-off":
    "M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z M10 8a2 2 0 1 1-4 0a2 2 0 1 1 4 0Z M2.5 13.5l11-11",
};

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export function icon(name: IconName, className = "icon"): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("d", PATHS[name]);
  svg.append(path);
  return svg;
}
