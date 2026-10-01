import type { PortDomain } from "@pantin/drive-types/ports";

// The chain diagram of ADR 0029 as plain data: boxes, sockets and edge paths
// in diagram units (one unit is one SVG user unit). The renderer only draws
// it; nothing here touches the DOM.

export type NodeKind = "drive" | "actuator" | "joint" | "sensor";

// "command": a drive's tag the PLC writes; "output": a drive port;
// "input": an actuator port; "feedback": a sensor's tag;
// "anchor": the single in or out point of a joint, or of a node with one link.
type SocketRole = "command" | "output" | "input" | "feedback" | "anchor";

export interface Socket {
  // Unique inside its node: "tag:<member>", "out:<port>", "in:<port>", "in", "out".
  id: string;
  label: string;
  role: SocketRole;
  side: "left" | "right";
  x: number;
  y: number;
  // Ports only: what the port carries.
  domain?: PortDomain;
  // Drive command tags and sensor tags: the full tag name, to light the socket from tag values.
  tagName?: string;
}

interface AssemblyBadge {
  key: string;
  name: string;
}

export interface DiagramNode {
  // "<kind>:<element id>", unique in the diagram.
  id: string;
  kind: NodeKind;
  elementId: string;
  label: string;
  // The element's type, e.g. "valve_5_2_double", for the renderer's icon and type label.
  elementType: string;
  // 0 drives, 1 actuators, 2 joints, 3 sensors.
  column: number;
  // Index of the node's first leaf row inside its band, from 0. Nodes are emitted in reading
  // order: band, then row, then column.
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
  // Key of the band the node is drawn in.
  band: string;
  // Set when the element belongs to another assembly than its band's.
  foreignAssembly?: AssemblyBadge;
  sockets: Socket[];
}

export interface DiagramBand {
  key: string;
  name: string;
  collapsed: boolean;
  y: number;
  height: number;
}

export type EdgeKind = PortDomain | "mechanical" | "observation";

export interface DiagramPoint {
  x: number;
  y: number;
}

export interface DiagramEdge {
  id: string;
  kind: EdgeKind;
  fromNode: string;
  fromSocket: string;
  toNode: string;
  toSocket: string;
  // A polyline from the source socket to the target socket: straight at equal heights, else a
  // horizontal stub, a slant across the gap, a horizontal stub.
  points: DiagramPoint[];
}

export interface ChainDiagram {
  width: number;
  height: number;
  bands: DiagramBand[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}
