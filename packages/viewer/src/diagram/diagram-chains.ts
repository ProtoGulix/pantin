import { JOINT_COORDINATE_UNITS, type PantinDocument } from "@pantin/protocol";

// Who is linked to whom in the chains of ADR 0029: a drive feeds actuators, an
// actuator moves joints, a sensor watches a joint. Read from the document
// rather than from the layout, so that the 3D view and the diagram agree even
// while a band is collapsed. Node ids are the diagram's "<kind>:<element id>".

export interface ChainLinks {
  parent: ReadonlyMap<string, string>;
  children: ReadonlyMap<string, readonly string[]>;
  // A movable joint's node id to the body it moves (its child).
  bodyOfJoint: ReadonlyMap<string, string>;
  // Every node the diagram can draw, whatever its band or collapse state.
  nodeIds: ReadonlySet<string>;
}

export const driveNode = (id: string) => `drive:${id}`;
export const actuatorNode = (id: string) => `actuator:${id}`;
export const jointNode = (id: string) => `joint:${id}`;
export const sensorNode = (id: string) => `sensor:${id}`;

/**
 * Several pure functions ask for the links of the same document at every store
 * update. The store keeps one of these: it builds them once per document object
 * (a fresh one per core answer, never mutated) and hands them to the functions
 * below, so that no module holds a cache of its own (CLAUDE.md section 8).
 */
export function createChainLinksCache(): (document: PantinDocument) => ChainLinks {
  let last: { document: PantinDocument; links: ChainLinks } | null = null;
  return (document) => {
    if (last === null || last.document !== document) {
      last = { document, links: buildChainLinks(document) };
    }
    return last.links;
  };
}

function buildChainLinks(document: PantinDocument): ChainLinks {
  const parent = new Map<string, string>();
  const children = new Map<string, string[]>();
  const link = (from: string, to: string): void => {
    // A joint listed by two actuators (invalid) keeps the first, like the layout.
    if (!parent.has(to)) {
      parent.set(to, from);
      children.set(from, [...(children.get(from) ?? []), to]);
    }
  };
  const movable = new Map(
    document.joints
      .filter((joint) => JOINT_COORDINATE_UNITS[joint.type] !== null)
      .map((joint) => [joint.id, joint.child]),
  );
  for (const actuator of document.actuators) {
    if (actuator.feed !== undefined) {
      link(driveNode(actuator.feed.drive), actuatorNode(actuator.id));
    }
    for (const jointId of actuator.joints.filter((id) => movable.has(id))) {
      link(actuatorNode(actuator.id), jointNode(jointId));
    }
  }
  for (const sensor of document.sensors.filter((candidate) => movable.has(candidate.joint))) {
    link(jointNode(sensor.joint), sensorNode(sensor.id));
  }
  const bodyOfJoint = new Map([...movable].map(([id, body]) => [jointNode(id), body]));
  const nodeIds = new Set([
    ...document.drives.map((drive) => driveNode(drive.id)),
    ...document.actuators.map((actuator) => actuatorNode(actuator.id)),
    ...bodyOfJoint.keys(),
    ...document.sensors.filter((sensor) => movable.has(sensor.joint)).map((s) => sensorNode(s.id)),
  ]);
  return { parent, children, bodyOfJoint, nodeIds };
}

function descendantsOf(links: ChainLinks, nodeId: string): string[] {
  const direct = links.children.get(nodeId) ?? [];
  return direct.flatMap((child) => [child, ...descendantsOf(links, child)]);
}

function ancestorsOf(links: ChainLinks, nodeId: string): string[] {
  const parent = links.parent.get(nodeId);
  return parent === undefined ? [] : [parent, ...ancestorsOf(links, parent)];
}

/** The node, what feeds it and everything it feeds: one chain from drive to sensors. */
export function chainOfNode(links: ChainLinks, nodeId: string): Set<string> {
  return new Set([nodeId, ...ancestorsOf(links, nodeId), ...descendantsOf(links, nodeId)]);
}

/**
 * The bodies moved downstream of a node (ADR 0029 point 9): a joint moves its
 * child, an actuator the children of its joints, a drive those of all its
 * actuators. A sensor moves nothing, so it shows the body of the joint it watches.
 */
export function downstreamBodyIds(links: ChainLinks, nodeId: string): Set<string> {
  const watched = links.parent.get(nodeId);
  const from = nodeId.startsWith("sensor:") && watched !== undefined ? watched : nodeId;
  const bodies = [from, ...descendantsOf(links, from)].flatMap(
    (id) => links.bodyOfJoint.get(id) ?? [],
  );
  return new Set(bodies);
}

/**
 * The nodes of the chains that move these bodies: their joints, what feeds
 * them and the sensors watching them.
 */
export function chainNodeIdsOfBodies(links: ChainLinks, bodyIds: ReadonlySet<string>): Set<string> {
  const joints = [...links.bodyOfJoint].filter(([, body]) => bodyIds.has(body)).map(([id]) => id);
  return new Set(
    joints.flatMap((joint) => [
      joint,
      ...ancestorsOf(links, joint),
      ...descendantsOf(links, joint),
    ]),
  );
}
