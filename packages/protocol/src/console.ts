import { DRIVE_DIAGNOSTICS } from "@pantin/drive-types/schemas";
import { z } from "zod";
import { ActuatorIdSchema, DriveIdSchema, JointIdSchema, SensorIdSchema } from "./ids.ts";
import { TagNameSchema } from "./tag.ts";

// The Pantin console (ADR 0031): what happens in the core, per open Pantin,
// kept in memory (last 1000 entries), never saved.
//
//   GET /api/pantins/:pantinId/console?after=<n>  -> ConsoleResponse
//
// `after` is a sequence number (default 0): the answer holds the entries whose
// `sequence` is greater, oldest first. The core sends no text: a client builds
// the message from `code` and `params` with its translation files (ADR 0010).
//
// Folding (ADR 0031 point 3): an event folds into the latest entry with the
// same code, source and params, looking back only through the trailing run of
// entries from that source; an entry from another source stops the search.
// The matched entry moves to the end with a new `sequence`, so that a client
// polling with `after` receives it again, its `count` grown by one and its
// times those of the latest occurrence. `firstSequence`, the `sequence` it was
// created with, never changes: it is what a client uses to recognise a line it
// already shows and update it. A flickering diagnostic is thus two entries.
//
// `consoleId` is one random id per console, made when the Pantin is opened.
// A client keeps it with its last sequence; when it changes (the core
// restarted, or the Pantin was closed and opened again) the sequences start
// over and the client must read from 0 again.

export const ConsoleLevelSchema = z.enum(["error", "warning", "info"]);
export type ConsoleLevel = z.infer<typeof ConsoleLevelSchema>;

// The Pantin itself, or one of its elements by id.
export const ConsoleSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pantin") }),
  z.object({ kind: z.literal("drive"), id: DriveIdSchema }),
  z.object({ kind: z.literal("actuator"), id: ActuatorIdSchema }),
  z.object({ kind: z.literal("sensor"), id: SensorIdSchema }),
  z.object({ kind: z.literal("joint"), id: JointIdSchema }),
]);
export type ConsoleSource = z.infer<typeof ConsoleSourceSchema>;

const DriveSourceSchema = z.object({ kind: z.literal("drive"), id: DriveIdSchema });
const JointOrDriveSourceSchema = z.discriminatedUnion("kind", [
  DriveSourceSchema,
  z.object({ kind: z.literal("joint"), id: JointIdSchema }),
]);
const PantinSourceSchema = z.object({ kind: z.literal("pantin") });

// Params are typed per code, not a loose record: a client's translation of a
// code knows which placeholders exist, and a new code cannot ship without
// saying what it carries. Every param is a primitive, so folding compares
// them by value.
const ParamsSchemas = {
  forced_tag_written: z.object({
    tag: TagNameSchema,
    forcedValue: z.number().finite(),
    writtenValue: z.number().finite(),
  }),
  // `detail` is the exception's message: developer text, not translated, but
  // what tells two different step errors apart. Cut to keep entries small.
  step_error: z.object({ detail: z.string().max(300) }),
  diagnostic: z.object({ diagnostic: z.enum(DRIVE_DIAGNOSTICS) }),
  fault: z.object({ fault: z.enum(["unresponsive", "jammed"]) }),
  migrated: z.object({
    from: z.number().int().positive(),
    to: z.number().int().positive(),
  }),
};

const eventShapes = {
  forcedTagWritten: z.object({
    code: z.literal("forced_tag_written"),
    level: z.literal("error"),
    source: ConsoleSourceSchema,
    params: ParamsSchemas.forced_tag_written,
  }),
  stepError: z.object({
    code: z.literal("step_error"),
    level: z.literal("error"),
    source: PantinSourceSchema,
    params: ParamsSchemas.step_error,
  }),
  diagnosticRaised: z.object({
    code: z.literal("diagnostic_raised"),
    level: z.literal("warning"),
    source: DriveSourceSchema,
    params: ParamsSchemas.diagnostic,
  }),
  diagnosticCleared: z.object({
    code: z.literal("diagnostic_cleared"),
    level: z.literal("info"),
    source: DriveSourceSchema,
    params: ParamsSchemas.diagnostic,
  }),
  faultSet: z.object({
    code: z.literal("fault_set"),
    level: z.literal("info"),
    source: JointOrDriveSourceSchema,
    params: ParamsSchemas.fault,
  }),
  faultCleared: z.object({
    code: z.literal("fault_cleared"),
    level: z.literal("info"),
    source: JointOrDriveSourceSchema,
    params: ParamsSchemas.fault,
  }),
  migrated: z.object({
    code: z.literal("migrated"),
    level: z.literal("info"),
    source: PantinSourceSchema,
    params: ParamsSchemas.migrated,
  }),
};

// One event: what the core reports, before it gets a sequence and times.
// The level is fixed by the code (ADR 0031 point 3).
export const ConsoleEventSchema = z.discriminatedUnion("code", [
  eventShapes.forcedTagWritten,
  eventShapes.stepError,
  eventShapes.diagnosticRaised,
  eventShapes.diagnosticCleared,
  eventShapes.faultSet,
  eventShapes.faultCleared,
  eventShapes.migrated,
]);
export type ConsoleEvent = z.infer<typeof ConsoleEventSchema>;
export type ConsoleCode = ConsoleEvent["code"];

const entryFields = {
  // Grows with every new entry and every fold, never reused (ADR 0031 point 1).
  sequence: z.number().int().positive(),
  firstSequence: z.number().int().positive(),
  // When the event happened, wall clock (ISO 8601) and simulated seconds.
  wallTime: z.iso.datetime(),
  simulationTime: z.number().finite().nonnegative(),
  // Occurrences folded into this entry, at least 1.
  count: z.number().int().positive(),
};

// An event with its entry fields; still discriminated by `code`, so the
// params of an entry narrow with its code.
export const ConsoleEntrySchema = z.discriminatedUnion("code", [
  eventShapes.forcedTagWritten.extend(entryFields),
  eventShapes.stepError.extend(entryFields),
  eventShapes.diagnosticRaised.extend(entryFields),
  eventShapes.diagnosticCleared.extend(entryFields),
  eventShapes.faultSet.extend(entryFields),
  eventShapes.faultCleared.extend(entryFields),
  eventShapes.migrated.extend(entryFields),
]);
export type ConsoleEntry = z.infer<typeof ConsoleEntrySchema>;

// Digits only: "?after=-1" or "?after=1.5" are refused, not coerced.
export const ConsoleQuerySchema = z.object({
  after: z
    .string()
    .regex(/^\d{1,15}$/, "Must be a sequence number: digits only.")
    .transform(Number)
    .optional(),
});
export type ConsoleQuery = z.infer<typeof ConsoleQuerySchema>;

export const ConsoleResponseSchema = z.object({
  entries: z.array(ConsoleEntrySchema),
  consoleId: z.string().min(1).max(64),
  // Highest sequence given so far (0 when none): poll with it as `after`,
  // also when no entry came back.
  lastSequence: z.number().int().nonnegative(),
});
export type ConsoleResponse = z.infer<typeof ConsoleResponseSchema>;
