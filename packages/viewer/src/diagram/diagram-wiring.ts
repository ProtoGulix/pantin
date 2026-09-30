import {
  ACTUATOR_INPUT_PORTS,
  type Actuator,
  type ActuatorFeed,
  type CreateActuatorRequest,
  type CreateSensorRequest,
  DRIVE_PORTS,
  type Drive,
  JOINT_COORDINATE_UNITS,
  type PantinDocument,
  type Sensor,
} from "@pantin/protocol";
import { feedReading, withPortSwapped } from "../actuators/actuator-feed.ts";
import { actuatorOfJoint, jointsCoordinateUnit } from "../actuators/actuator-joints.ts";
import type { MessageKey, MessageParameters } from "../i18n/translate.ts";

// What a link drawn in the diagram asks of the core (ADR 0029 point 6), as
// pure functions over the document. Every link is an update of an actuator or
// a sensor, built with the same rules as the forms (actuator-feed.ts,
// actuator-joints.ts); the core stays the judge of validity, this only avoids
// sending what the diagram can tell is refused and says why.

export interface Endpoint {
  nodeId: string;
  socketId: string;
}

export type DiagramEdit =
  | { kind: "actuator"; actuatorId: string; request: CreateActuatorRequest }
  | { kind: "sensor"; sensorId: string; request: CreateSensorRequest };

interface Refusal {
  key: MessageKey;
  parameters: MessageParameters;
}

// A feed from another drive replaces the whole one: the user confirms first.
export interface ReplacedFeed {
  actuatorName: string;
  fromDrive: string;
  toDrive: string;
}

export type EditResult =
  | { ok: true; edit: DiagramEdit; confirm: ReplacedFeed | null }
  | { ok: false; refusal: Refusal; linkable: boolean };

const refuse = (
  key: MessageKey,
  parameters: MessageParameters = {},
  linkable = true,
): EditResult => ({
  ok: false,
  refusal: { key, parameters },
  linkable,
});

const accept = (edit: DiagramEdit, confirm: ReplacedFeed | null = null): EditResult => ({
  ok: true,
  edit,
  confirm,
});

/** "actuator:cyl" is the kind "actuator" and the element id "cyl". */
export function splitNodeId(nodeId: string): { kind: string; id: string } {
  const colon = nodeId.indexOf(":");
  return { kind: nodeId.slice(0, colon), id: nodeId.slice(colon + 1) };
}

/** The actuator as an update request, with the feed and joints it should end up with. */
function actuatorRequest(
  actuator: Actuator,
  feed: ActuatorFeed | undefined,
  joints: readonly string[],
): CreateActuatorRequest {
  // The id is the URL's, and the feed and joints are the ones being changed.
  const { id: _id, feed: _feed, joints: _joints, ...rest } = actuator;
  return feed === undefined
    ? { ...rest, joints: [...joints] }
    : { ...rest, feed, joints: [...joints] };
}

function feedLink(
  actuator: Actuator,
  inputPort: string,
  drive: Drive,
  outputPort: string,
  document: PantinDocument,
): EditResult {
  const input = ACTUATOR_INPUT_PORTS[actuator.type].find((port) => port.name === inputPort);
  const output = DRIVE_PORTS[drive.type].find((port) => port.name === outputPort);
  if (input === undefined || output === undefined || input.domain !== output.domain) {
    return refuse("diagram.refusal.domain", { port: outputPort, input: inputPort });
  }
  const { feed } = actuator;
  const sameDrive = feed?.drive === drive.id;
  if (sameDrive && feed.ports[inputPort] === outputPort) {
    return refuse("diagram.refusal.alreadyLinked");
  }
  const ports =
    sameDrive && feed !== undefined
      ? withPortSwapped(feed.ports, inputPort, outputPort)
      : feedReading(actuator.type, drive.type, inputPort, outputPort);
  if (ports === null) {
    return refuse("diagram.refusal.noDefaultFeed", { drive: drive.name, actuator: actuator.name });
  }
  const edit: DiagramEdit = {
    kind: "actuator",
    actuatorId: actuator.id,
    request: actuatorRequest(actuator, { drive: drive.id, ports }, actuator.joints),
  };
  const previous =
    feed === undefined ? undefined : document.drives.find((d) => d.id === feed.drive);
  const replaced =
    feed === undefined || sameDrive
      ? null
      : {
          actuatorName: actuator.name,
          fromDrive: previous?.name ?? feed.drive,
          toDrive: drive.name,
        };
  return accept(edit, replaced);
}

function jointLink(actuator: Actuator, jointId: string, document: PantinDocument): EditResult {
  const joint = document.joints.find((candidate) => candidate.id === jointId);
  const unit = joint === undefined ? null : JOINT_COORDINATE_UNITS[joint.type];
  if (joint === undefined || unit === null) {
    return refuse("diagram.refusal.jointFixed", { joint: jointId }, false);
  }
  if (actuator.joints.includes(jointId)) {
    return refuse("diagram.refusal.alreadyLinked");
  }
  const mover = actuatorOfJoint(document, jointId);
  if (mover !== undefined) {
    return refuse("diagram.refusal.jointMoved", { joint: joint.name, actuator: mover.name });
  }
  if (actuator.joints.length > 0 && jointsCoordinateUnit(document, actuator.joints) !== unit) {
    return refuse("diagram.refusal.jointUnit", { joint: joint.name, actuator: actuator.name });
  }
  const joints = [...actuator.joints, jointId];
  return accept({
    kind: "actuator",
    actuatorId: actuator.id,
    request: actuatorRequest(actuator, actuator.feed, joints),
  });
}

function sensorLink(sensor: Sensor, jointId: string): EditResult {
  if (sensor.joint === jointId) {
    return refuse("diagram.refusal.alreadyLinked");
  }
  // The id and the tag key are the sensor's own, not part of an update.
  const { id: _id, tagKey: _tagKey, ...rest } = sensor;
  return accept({ kind: "sensor", sensorId: sensor.id, request: { ...rest, joint: jointId } });
}

// The link from the end a drag starts at to the end it drops on; null when
// these two sockets are not a pair at all.
function linkFrom(document: PantinDocument, from: Endpoint, to: Endpoint): EditResult | null {
  const source = splitNodeId(from.nodeId);
  const target = splitNodeId(to.nodeId);
  if (source.kind === "drive" && target.kind === "actuator") {
    const drive = document.drives.find((candidate) => candidate.id === source.id);
    const actuator = document.actuators.find((candidate) => candidate.id === target.id);
    return drive === undefined ||
      actuator === undefined ||
      !from.socketId.startsWith("out:") ||
      !to.socketId.startsWith("in:")
      ? null
      : feedLink(
          actuator,
          to.socketId.slice("in:".length),
          drive,
          from.socketId.slice("out:".length),
          document,
        );
  }
  if (source.kind === "actuator" && target.kind === "joint" && from.socketId === "out") {
    const actuator = document.actuators.find((candidate) => candidate.id === source.id);
    return actuator === undefined ? null : jointLink(actuator, target.id, document);
  }
  if (source.kind === "sensor" && target.kind === "joint" && from.socketId === "in") {
    const sensor = document.sensors.find((candidate) => candidate.id === source.id);
    return sensor === undefined ? null : sensorLink(sensor, target.id);
  }
  return null;
}

/**
 * What linking two sockets does, whichever one the user started from: a drive
 * output to an actuator input, an actuator to a joint, a sensor to a joint.
 */
export function linkBetween(document: PantinDocument, a: Endpoint, b: Endpoint): EditResult {
  return (
    linkFrom(document, a, b) ??
    linkFrom(document, b, a) ??
    refuse("diagram.refusal.notLinkable", {}, false)
  );
}

/**
 * Removes the link that runs from one node to the next: a whole feed, or one
 * joint of an actuator. A sensor always watches a joint, so its link stays.
 */
export function removalBetween(
  document: PantinDocument,
  fromNodeId: string,
  toNodeId: string,
): EditResult {
  const source = splitNodeId(fromNodeId);
  const target = splitNodeId(toNodeId);
  if (source.kind === "drive" && target.kind === "actuator") {
    const actuator = document.actuators.find((candidate) => candidate.id === target.id);
    return actuator === undefined
      ? refuse("diagram.refusal.notLinkable", {}, false)
      : accept({
          kind: "actuator",
          actuatorId: actuator.id,
          request: actuatorRequest(actuator, undefined, actuator.joints),
        });
  }
  if (source.kind === "actuator" && target.kind === "joint") {
    const actuator = document.actuators.find((candidate) => candidate.id === source.id);
    return actuator === undefined
      ? refuse("diagram.refusal.notLinkable", {}, false)
      : accept({
          kind: "actuator",
          actuatorId: actuator.id,
          request: actuatorRequest(
            actuator,
            actuator.feed,
            actuator.joints.filter((id) => id !== target.id),
          ),
        });
  }
  return refuse("diagram.refusal.sensorNeedsJoint");
}
