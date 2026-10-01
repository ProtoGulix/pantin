import {
  type ConsoleEntry,
  ConsoleEntrySchema,
  type ConsoleResponse,
  type PantinResponse,
} from "@pantin/protocol";
import {
  bodyOf,
  cylinderOf,
  documentOf,
  driveOf,
  encoderOf,
  jointOf,
} from "../diagram/diagram-fixtures.ts";

// Sample console data shared by the tests of this folder and of the controller.

export const consolePantin: PantinResponse = {
  id: "press",
  unsavedChanges: false,
  document: documentOf({
    assemblies: ["a"],
    bodies: [bodyOf("s1", "a")],
    joints: [jointOf("j1", "s1")],
    drives: [driveOf("v1", "a")],
    actuators: [cylinderOf("c1", "a", "v1", ["j1"])],
    sensors: [encoderOf("e1", "a", "j1")],
  }),
};

/** A diagnostic entry of drive `v1`; override what a test is about. */
export function entryOf(sequence: number, overrides: Partial<ConsoleEntry> = {}): ConsoleEntry {
  // Parsed, not cast: a spread of a Partial of the union cannot be narrowed by
  // the compiler, and the schema also refuses a fixture that is not an entry.
  return ConsoleEntrySchema.parse({
    sequence,
    firstSequence: sequence,
    wallTime: "2026-10-01T12:00:00.000Z",
    simulationTime: 1.5,
    count: 1,
    code: "diagnostic_raised",
    level: "warning",
    source: { kind: "drive", id: "v1" },
    params: { diagnostic: "conflicting_commands" },
    ...overrides,
  });
}

export function answerOf(
  entries: ConsoleEntry[],
  consoleId = "console-1",
  lastSequence = Math.max(0, ...entries.map((entry) => entry.sequence)),
): ConsoleResponse {
  return { entries, consoleId, lastSequence };
}
