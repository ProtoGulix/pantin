import {
  ACTUATOR_DEFAULT_FEEDS,
  ACTUATOR_INPUT_PORTS,
  type ActuatorType,
  DRIVE_PORTS,
  type Drive,
  type DriveType,
  type PantinDocument,
} from "@pantin/protocol";

// Which drives can feed an actuator type, and through which ports (ADR 0028
// point 2). Pure data lookups over the protocol's registries: no drive or
// actuator type is named here.

/** The output ports of a drive type that an input port can read: same domain. */
export function matchingOutputPorts(
  actuatorType: ActuatorType,
  inputPort: string,
  driveType: DriveType,
): string[] {
  const input = ACTUATOR_INPUT_PORTS[actuatorType].find((port) => port.name === inputPort);
  return DRIVE_PORTS[driveType]
    .filter((output) => output.domain === input?.domain)
    .map((output) => output.name);
}

/**
 * The feed to offer on creation: for each input port, the first output port
 * of the drive among its preferences (ACTUATOR_DEFAULT_FEEDS), else any port
 * of the right domain not already read by another input. Null when some input
 * port has no source left: a double-acting cylinder on a 3/2 valve.
 */
export function defaultFeedPorts(
  actuatorType: ActuatorType,
  driveType: DriveType,
): Record<string, string> | null {
  const ports: Record<string, string> = {};
  const used = new Set<string>();
  for (const input of ACTUATOR_INPUT_PORTS[actuatorType]) {
    const candidates = matchingOutputPorts(actuatorType, input.name, driveType);
    const preferred = ACTUATOR_DEFAULT_FEEDS[actuatorType][input.name] ?? [];
    const chosen =
      preferred.find((name) => candidates.includes(name) && !used.has(name)) ??
      candidates.find((name) => !used.has(name));
    if (chosen === undefined) {
      return null;
    }
    ports[input.name] = chosen;
    used.add(chosen);
  }
  return ports;
}

/** The drives whose output ports can supply every input port of the type. */
export function drivesFeeding(document: PantinDocument, actuatorType: ActuatorType): Drive[] {
  return document.drives.filter((drive) => defaultFeedPorts(actuatorType, drive.type) !== null);
}
