import {
  type Belt,
  endpointAssemblyIn,
  JOINT_COORDINATE_UNITS,
  type PantinDocument,
} from "@pantin/protocol";
import type { Language } from "../i18n/translate.ts";
import {
  actuatorSockets,
  beltSockets,
  driveSockets,
  jointSockets,
  type SocketSpecs,
  sensorSockets,
} from "./diagram-sockets.ts";
import type { NodeKind } from "./diagram-types.ts";

// The chains of a document as a forest (ADR 0029 point 3): a drive is fed by
// nothing, an actuator by one drive at most, a joint moved by one actuator at
// most, a sensor watches one joint. Each node has one parent in the column to
// its left, so a plain tree per root is enough.

export interface ForestNode {
  // "<kind>:<element id>".
  id: string;
  kind: NodeKind;
  elementId: string;
  label: string;
  elementType: string;
  // The assembly the element belongs to; undefined for a joint whose child body is unknown.
  assembly: string | undefined;
  column: number;
  sockets: SocketSpecs;
  // Actuators only: for each input port, the output port of the parent drive.
  feedPorts: Readonly<Record<string, string>>;
  // Ordered by element id.
  children: ForestNode[];
}

// A belt shares the last column with the sensors: it is the end of its chain, drawn after them.
const COLUMN_OF: Record<NodeKind, number> = { drive: 0, actuator: 1, joint: 2, sensor: 3, belt: 3 };
const BELT_AFTER_SENSORS = 1;

// Code point order, not locale order, so that the layout does not depend on the browser.
function compareIds(first: string, second: string): number {
  if (first === second) {
    return 0;
  }
  return first < second ? -1 : 1;
}

type NodeParts = Pick<ForestNode, "kind" | "elementId" | "label" | "elementType" | "assembly"> & {
  sockets: SocketSpecs;
  feedPorts?: Readonly<Record<string, string>> | undefined;
};

function makeNode(parts: NodeParts): ForestNode {
  return {
    ...parts,
    id: `${parts.kind}:${parts.elementId}`,
    column: COLUMN_OF[parts.kind],
    feedPorts: parts.feedPorts ?? {},
    children: [],
  };
}

function attach(parent: ForestNode | undefined, child: ForestNode, roots: ForestNode[]): void {
  (parent === undefined ? roots : parent.children).push(child);
}

/**
 * The roots of every chain, ordered by column then id, each with its
 * descendants. A fixed joint is left out: the protocol refuses a sensor on it
 * and no actuator moves it (ADR 0029 point 2). A dangling reference makes the
 * element a root (an actuator fed by an unknown drive) or drops it (a sensor on
 * an unknown joint), because the core, not the diagram, judges validity.
 */
export function buildForest(document: PantinDocument, language: Language): ForestNode[] {
  const drives = new Map(
    document.drives.map((drive) => [
      drive.id,
      makeNode({
        kind: "drive",
        elementId: drive.id,
        label: drive.name,
        elementType: drive.type,
        assembly: drive.assembly,
        sockets: driveSockets(drive, language),
      }),
    ]),
  );
  const actuators = actuatorNodes(document, language);
  const joints = movableJointNodes(document);
  const roots: ForestNode[] = [...drives.values()];
  for (const actuator of document.actuators) {
    const node = actuators.get(actuator.id);
    if (node !== undefined) {
      attach(drives.get(actuator.feed?.drive ?? ""), node, roots);
    }
  }
  attachJoints(document, actuators, joints, roots);
  for (const sensor of document.sensors) {
    joints.get(sensor.joint)?.children.push(
      makeNode({
        kind: "sensor",
        elementId: sensor.id,
        label: sensor.name,
        elementType: sensor.type,
        assembly: sensor.assembly,
        sockets: sensorSockets(sensor, language),
      }),
    );
  }
  attachBelts(document.belts, joints);
  return sortForest(roots);
}

function attachBelts(belts: readonly Belt[], joints: Map<string, ForestNode>): void {
  for (const belt of belts) {
    joints.get(belt.drumJoint)?.children.push(
      makeNode({
        kind: "belt",
        elementId: belt.id,
        label: belt.name,
        elementType: "belt",
        assembly: belt.assembly,
        sockets: beltSockets(),
      }),
    );
  }
}

function actuatorNodes(document: PantinDocument, language: Language): Map<string, ForestNode> {
  const drivesById = new Map(document.drives.map((drive) => [drive.id, drive]));
  return new Map(
    document.actuators.map((actuator) => [
      actuator.id,
      makeNode({
        kind: "actuator",
        elementId: actuator.id,
        label: actuator.name,
        elementType: actuator.type,
        assembly: actuator.assembly,
        sockets: actuatorSockets(actuator, language, drivesById.get(actuator.feed?.drive ?? "")),
        feedPorts: actuator.feed?.ports,
      }),
    ]),
  );
}

function movableJointNodes(document: PantinDocument): Map<string, ForestNode> {
  const nodes = document.joints
    .filter((joint) => JOINT_COORDINATE_UNITS[joint.type] !== null)
    .map((joint) => {
      // A joint has no assembly of its own: it is the one its child moves (ADR 0019).
      const node = makeNode({
        kind: "joint",
        elementId: joint.id,
        label: joint.name,
        elementType: joint.type,
        assembly: endpointAssemblyIn(joint.child, document.bodies),
        sockets: jointSockets(),
      });
      return [joint.id, node] as const;
    });
  return new Map(nodes);
}

function attachJoints(
  document: PantinDocument,
  actuators: Map<string, ForestNode>,
  joints: Map<string, ForestNode>,
  roots: ForestNode[],
): void {
  const moved = new Set<string>();
  // Actuators in id order, so that a joint listed twice (invalid) goes to the same one every time.
  const ordered = [...document.actuators].sort((a, b) => compareIds(a.id, b.id));
  for (const actuator of ordered) {
    for (const jointId of actuator.joints) {
      const joint = joints.get(jointId);
      if (joint !== undefined && !moved.has(jointId)) {
        moved.add(jointId);
        actuators.get(actuator.id)?.children.push(joint);
      }
    }
  }
  for (const joint of joints.values()) {
    if (!moved.has(joint.elementId)) {
      roots.push(joint);
    }
  }
}

function sortForest(nodes: ForestNode[]): ForestNode[] {
  const rank = (node: ForestNode) => (node.kind === "belt" ? BELT_AFTER_SENSORS : 0);
  const sorted = [...nodes].sort(
    (a, b) => a.column - b.column || rank(a) - rank(b) || compareIds(a.elementId, b.elementId),
  );
  for (const node of sorted) {
    node.children = sortForest(node.children);
  }
  return sorted;
}
