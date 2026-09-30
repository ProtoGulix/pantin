import { ACTUATOR_INPUT_PORTS, type ActuatorType } from "@pantin/actuator-types/schemas";
import { DRIVE_PORTS, type DriveType } from "@pantin/drive-types/schemas";
import type { z } from "zod";
import type { ActuatorFeed } from "./actuator.ts";

// The feed rules of an actuator (ADR 0028 points 2, 6 and 9): the feed covers
// every input port of the actuator's type, from output ports of one existing
// drive, of the domain of the input port; and every actuator fed by one servo
// drive moves joints of one unit, since the drive's limits are in that unit.

export type FeedDrive = { id: string; type: DriveType };

type FeedCheck = {
  actuator: { id: string; type: ActuatorType; feed?: ActuatorFeed | undefined };
  index: number;
  // Coordinate unit of the actuator's joints, null when it has none.
  unit: string | null;
  drives: ReadonlyMap<string, FeedDrive>;
  // First unit met for each servo drive id, filled as actuators are checked.
  unitOfServoDrive: Map<string, string>;
};

function issue(context: z.RefinementCtx, index: number, message: string): void {
  context.addIssue({ code: "custom", path: ["actuators", index, "feed"], message });
}

function portsIssues(actuatorId: string, feed: ActuatorFeed, drive: FeedDrive, type: ActuatorType) {
  const problems: string[] = [];
  const inputs = ACTUATOR_INPUT_PORTS[type];
  const outputs = DRIVE_PORTS[drive.type];
  for (const input of inputs) {
    const outputName = feed.ports[input.name];
    if (outputName === undefined) {
      problems.push(
        `The feed of actuator "${actuatorId}" has no source for its port "${input.name}".`,
      );
      continue;
    }
    const output = outputs.find((candidate) => candidate.name === outputName);
    if (output === undefined) {
      problems.push(
        `The feed of actuator "${actuatorId}" reads "${outputName}", which drive "${drive.id}" does not have.`,
      );
    } else if (output.domain !== input.domain) {
      problems.push(
        `The feed of actuator "${actuatorId}" connects port "${input.name}" (${input.domain}) to "${outputName}" of drive "${drive.id}" (${output.domain}); the domains must match.`,
      );
    }
  }
  for (const name of Object.keys(feed.ports)) {
    if (!inputs.some((input) => input.name === name)) {
      problems.push(
        `The feed of actuator "${actuatorId}" names "${name}", which is not one of its ports.`,
      );
    }
  }
  return [...problems, ...reusedOutputIssues(actuatorId, feed, drive)];
}

// One output port feeds one input port of an actuator at most (ADR 0028 point
// 2): two chambers cannot be tied to the same port.
function reusedOutputIssues(actuatorId: string, feed: ActuatorFeed, drive: FeedDrive): string[] {
  const inputsOf = new Map<string, string[]>();
  for (const [input, output] of Object.entries(feed.ports)) {
    inputsOf.set(output, [...(inputsOf.get(output) ?? []), input]);
  }
  return [...inputsOf]
    .filter(([, inputs]) => inputs.length > 1)
    .map(
      ([output, inputs]) =>
        `The feed of actuator "${actuatorId}" reads "${output}" of drive "${drive.id}" for ports "${inputs.join('", "')}"; each output port can feed only one input port of an actuator.`,
    );
}

export function actuatorFeedIssues(check: FeedCheck, context: z.RefinementCtx): void {
  const { actuator, index, drives } = check;
  const feed = actuator.feed;
  if (feed === undefined) {
    return;
  }
  const drive = drives.get(feed.drive);
  if (drive === undefined) {
    issue(
      context,
      index,
      `Actuator "${actuator.id}" is fed by drive "${feed.drive}", which does not exist.`,
    );
    return;
  }
  for (const problem of portsIssues(actuator.id, feed, drive, actuator.type)) {
    issue(context, index, problem);
  }
  servoUnitIssue(check, drive, context);
}

function servoUnitIssue(check: FeedCheck, drive: FeedDrive, context: z.RefinementCtx): void {
  const isServo = DRIVE_PORTS[drive.type].some((port) => port.domain === "servo");
  if (!isServo || check.unit === null) {
    return;
  }
  const known = check.unitOfServoDrive.get(drive.id);
  if (known === undefined) {
    check.unitOfServoDrive.set(drive.id, check.unit);
  } else if (known !== check.unit) {
    issue(
      context,
      check.index,
      `Servo drive "${drive.id}" feeds actuators that move joints in metres and in radians; its actuators must move joints of one unit.`,
    );
  }
}
