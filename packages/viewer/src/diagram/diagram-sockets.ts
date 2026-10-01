import { ACTUATOR_LABELS } from "@pantin/actuator-types/labels";
import { DRIVE_LABELS } from "@pantin/drive-types/labels";
import {
  ACTUATOR_INPUT_PORTS,
  type Actuator,
  DRIVE_PORTS,
  DRIVE_TAGS,
  type Drive,
  SENSOR_TAGS,
  type Sensor,
  tagName,
} from "@pantin/protocol";
import { SENSOR_LABELS } from "@pantin/sensor-types/labels";
import { defaultFeedPorts } from "../actuators/actuator-feed.ts";
import type { Language } from "../i18n/translate.ts";
import type { Socket } from "./diagram-types.ts";

// The sockets a node offers, from the type registries (ADR 0029 point 2), in
// the order the types declare them. Each label comes from the type's labels.ts
// (ADR 0030 point 5), never a raw key. Positions are given later, once the node
// has a place. The `??` fallbacks on labels are unreachable for a registered
// type (schemas.test.ts covers every label); they only satisfy
// noUncheckedIndexedAccess.

export type SocketSpec = Omit<Socket, "x" | "y">;

export interface SocketSpecs {
  left: SocketSpec[];
  right: SocketSpec[];
}

const IN_ANCHOR: SocketSpec = { id: "in", label: "", role: "anchor", side: "left" };
const OUT_ANCHOR: SocketSpec = { id: "out", label: "", role: "anchor", side: "right" };

// A drive's feedback tags (a servo's position) are not wired to anything in
// the diagram, so only the tags the PLC writes appear, as inputs.
export function driveSockets(drive: Drive, language: Language): SocketSpecs {
  const labels = DRIVE_LABELS[drive.type][language];
  const commands = DRIVE_TAGS[drive.type].filter((tag) => tag.direction === "command");
  return {
    left: commands.map((tag) => ({
      id: `tag:${tag.member}`,
      label: labels.tags[tag.member] ?? tag.member,
      role: "command",
      side: "left",
      tagName: tagName(drive.assembly, drive.tagKey, tag.member),
    })),
    right: DRIVE_PORTS[drive.type].map((port) => ({
      id: `out:${port.name}`,
      label: labels.ports[port.name] ?? port.name,
      role: "output",
      side: "right",
      domain: port.domain,
    })),
  };
}

// A fed actuator lists its input sockets in the order of the drive ports its
// type reads by default (ADR 0028 point 2), so that the usual wiring runs
// straight across and a swapped one visibly crosses. The order depends on the
// drive type only, not on the actual feed, so sockets do not jump when a feed
// is rewired. Without feed, or when no default exists, declaration order.
function socketOrder(actuator: Actuator, drive: Drive | undefined) {
  const inputs = ACTUATOR_INPUT_PORTS[actuator.type];
  if (actuator.feed === undefined || drive === undefined) {
    return inputs;
  }
  const defaults = defaultFeedPorts(actuator.type, drive.type);
  if (defaults === null) {
    return inputs;
  }
  const ports = DRIVE_PORTS[drive.type].map((port) => port.name);
  return [...inputs].sort(
    (a, b) => ports.indexOf(defaults[a.name] ?? "") - ports.indexOf(defaults[b.name] ?? ""),
  );
}

// An actuator without feed keeps its input sockets: they are where a feed
// will be dropped, and show at a glance that nothing drives it.
export function actuatorSockets(
  actuator: Actuator,
  language: Language,
  drive?: Drive,
): SocketSpecs {
  const labels = ACTUATOR_LABELS[actuator.type][language];
  const ordered = socketOrder(actuator, drive);
  return {
    left: ordered.map((port) => ({
      id: `in:${port.name}`,
      label: labels.ports[port.name] ?? port.name,
      role: "input",
      side: "left",
      domain: port.domain,
    })),
    right: [OUT_ANCHOR],
  };
}

export function jointSockets(): SocketSpecs {
  return { left: [IN_ANCHOR], right: [OUT_ANCHOR] };
}

export function sensorSockets(sensor: Sensor, language: Language): SocketSpecs {
  const labels = SENSOR_LABELS[sensor.type][language];
  return {
    left: [IN_ANCHOR],
    right: SENSOR_TAGS[sensor.type].map((tag) => ({
      id: `tag:${tag.member}`,
      label: labels.tags[tag.member] ?? tag.member,
      role: "feedback",
      side: "right",
      tagName: tagName(sensor.assembly, sensor.tagKey, tag.member),
    })),
  };
}
