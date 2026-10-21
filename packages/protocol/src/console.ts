import { z } from "zod";
import { ParamsSchemas } from "./console-params.ts";
import {
  ActuatorIdSchema,
  BodyIdSchema,
  DriveIdSchema,
  JointIdSchema,
  PresenceSensorIdSchema,
  SensorIdSchema,
} from "./ids.ts";

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
// Verbose mode (ADR 0061): a runtime flag of the open Pantin, never saved. While
// it is on, a sensor bit changing writes a `trace` entry. Set with
//   PUT /api/pantins/:pantinId/console  SetConsoleVerboseRequest -> { verbose }
// (the current value is accepted), read in ConsoleResponse. Trace entries are
// never sent on the tag bus. At most TRACE_BUDGET_ENTRIES are written per
// TRACE_BUDGET_WINDOW_STEPS steps, then one `trace_dropped` entry counts the
// rest. A full buffer drops its oldest trace entry first.
//
// `consoleId` is one random id per console, made when the Pantin is opened.
// A client keeps it with its last sequence; when it changes (the core
// restarted, or the Pantin was closed and opened again) the sequences start
// over and the client must read from 0 again.

export const TRACE_BUDGET_ENTRIES = 120;
export const TRACE_BUDGET_WINDOW_STEPS = 120;

export const ConsoleLevelSchema = z.enum(["error", "warning", "info", "trace"]);
export type ConsoleLevel = z.infer<typeof ConsoleLevelSchema>;

// The Pantin itself, or one of its elements by id.
export const ConsoleSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pantin") }),
  z.object({ kind: z.literal("drive"), id: DriveIdSchema }),
  z.object({ kind: z.literal("actuator"), id: ActuatorIdSchema }),
  z.object({ kind: z.literal("sensor"), id: SensorIdSchema }),
  z.object({ kind: z.literal("presence_sensor"), id: PresenceSensorIdSchema }),
  z.object({ kind: z.literal("joint"), id: JointIdSchema }),
  z.object({ kind: z.literal("body"), id: BodyIdSchema }),
]);
export type ConsoleSource = z.infer<typeof ConsoleSourceSchema>;

const DriveSourceSchema = z.object({ kind: z.literal("drive"), id: DriveIdSchema });
const JointOrDriveSourceSchema = z.discriminatedUnion("kind", [
  DriveSourceSchema,
  z.object({ kind: z.literal("joint"), id: JointIdSchema }),
]);
const PantinSourceSchema = z.object({ kind: z.literal("pantin") });
const SensorOrPresenceSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sensor"), id: SensorIdSchema }),
  z.object({ kind: z.literal("presence_sensor"), id: PresenceSensorIdSchema }),
]);
const BodySourceSchema = z.object({ kind: z.literal("body"), id: BodyIdSchema });

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
  clockPaused: z.object({
    code: z.literal("clock_paused"),
    level: z.literal("info"),
    source: PantinSourceSchema,
    params: ParamsSchemas.clock,
  }),
  clockResumed: z.object({
    code: z.literal("clock_resumed"),
    level: z.literal("info"),
    source: PantinSourceSchema,
    params: ParamsSchemas.clock,
  }),
  faceFileMissing: z.object({
    code: z.literal("face_file_missing"),
    level: z.literal("warning"),
    source: BodySourceSchema,
    params: ParamsSchemas.face_file_missing,
  }),
  emitterBlocked: z.object({
    code: z.literal("emitter_blocked"),
    level: z.literal("warning"),
    source: PantinSourceSchema,
    params: ParamsSchemas.spawn_skipped,
  }),
  productLimit: z.object({
    code: z.literal("product_limit"),
    level: z.literal("warning"),
    source: PantinSourceSchema,
    params: ParamsSchemas.spawn_skipped,
  }),
  physicsRebuilt: z.object({
    code: z.literal("physics_rebuilt"),
    level: z.literal("info"),
    source: PantinSourceSchema,
    params: ParamsSchemas.physics_rebuilt,
  }),
  plcConnected: z.object({
    code: z.literal("plc_connected"),
    level: z.literal("info"),
    source: PantinSourceSchema,
    params: ParamsSchemas.plc_module,
  }),
  plcDisconnected: z.object({
    code: z.literal("plc_disconnected"),
    level: z.literal("warning"),
    source: PantinSourceSchema,
    params: ParamsSchemas.plc_module_lost,
  }),
  bridgeConnected: z.object({
    code: z.literal("bridge_connected"),
    level: z.literal("info"),
    source: PantinSourceSchema,
    params: ParamsSchemas.clock,
  }),
  bridgeDisconnected: z.object({
    code: z.literal("bridge_disconnected"),
    level: z.literal("warning"),
    source: PantinSourceSchema,
    params: ParamsSchemas.bridge_lost,
  }),
  bridgeFailed: z.object({
    code: z.literal("bridge_failed"),
    level: z.literal("error"),
    source: PantinSourceSchema,
    params: ParamsSchemas.bridge_failed,
  }),
  bridgeLog: z.object({
    code: z.literal("bridge_log"),
    level: z.literal("warning"),
    source: PantinSourceSchema,
    params: ParamsSchemas.bridge_log,
  }),
  sensorChanged: z.object({
    code: z.literal("sensor_changed"),
    level: z.literal("trace"),
    source: SensorOrPresenceSourceSchema,
    params: ParamsSchemas.sensor_changed,
  }),
  traceDropped: z.object({
    code: z.literal("trace_dropped"),
    level: z.literal("info"),
    source: PantinSourceSchema,
    params: ParamsSchemas.trace_dropped,
  }),
  // ADR 0045 point 12: paused while a bridge is connected, which the PLC sees
  // as a frozen machine.
  clockPausedWithBridge: z.object({
    code: z.literal("clock_paused_with_bridge"),
    level: z.literal("warning"),
    source: PantinSourceSchema,
    params: ParamsSchemas.clock,
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
  eventShapes.clockPaused,
  eventShapes.clockResumed,
  eventShapes.faceFileMissing,
  eventShapes.emitterBlocked,
  eventShapes.productLimit,
  eventShapes.physicsRebuilt,
  eventShapes.plcConnected,
  eventShapes.plcDisconnected,
  eventShapes.bridgeConnected,
  eventShapes.bridgeDisconnected,
  eventShapes.bridgeFailed,
  eventShapes.bridgeLog,
  eventShapes.clockPausedWithBridge,
  eventShapes.sensorChanged,
  eventShapes.traceDropped,
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
  eventShapes.clockPaused.extend(entryFields),
  eventShapes.clockResumed.extend(entryFields),
  eventShapes.faceFileMissing.extend(entryFields),
  eventShapes.emitterBlocked.extend(entryFields),
  eventShapes.productLimit.extend(entryFields),
  eventShapes.physicsRebuilt.extend(entryFields),
  eventShapes.plcConnected.extend(entryFields),
  eventShapes.plcDisconnected.extend(entryFields),
  eventShapes.bridgeConnected.extend(entryFields),
  eventShapes.bridgeDisconnected.extend(entryFields),
  eventShapes.bridgeFailed.extend(entryFields),
  eventShapes.bridgeLog.extend(entryFields),
  eventShapes.clockPausedWithBridge.extend(entryFields),
  eventShapes.sensorChanged.extend(entryFields),
  eventShapes.traceDropped.extend(entryFields),
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
  // Whether verbose mode is on now, for a client that did not set it itself.
  verbose: z.boolean(),
});
export type ConsoleResponse = z.infer<typeof ConsoleResponseSchema>;

export const SetConsoleVerboseRequestSchema = z.object({ verbose: z.boolean() });
export type SetConsoleVerboseRequest = z.infer<typeof SetConsoleVerboseRequestSchema>;
