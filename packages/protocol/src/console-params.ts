import { DRIVE_DIAGNOSTICS } from "@pantin/drive-types/schemas";
import { z } from "zod";
import { BridgeFailureKindSchema } from "./bridge.ts";
import { EmitterIdSchema, KeySchema } from "./ids.ts";
import { PlcModuleLossReasonSchema } from "./plc-link.ts";
import { TagNameSchema } from "./tag.ts";

// The files of a Pantin folder that Pantin watches for outside edits (ADR 0063).
export const ChangedOutsideFileSchema = z.enum(["pantin.json", "io.json"]);
export type ChangedOutsideFile = z.infer<typeof ChangedOutsideFileSchema>;

// Params are typed per code, not a loose record: a client's translation of a
// code knows which placeholders exist, and a new code cannot ship without
// saying what it carries. Every param is a primitive, so folding compares
// them by value.
export const ParamsSchemas = {
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
  // ADR 0055 point 9: `followers` lists, cut to keep entries small, the bodies
  // that never moved and now follow their group; absent when there are none.
  migrated: z.object({
    from: z.number().int().positive(),
    to: z.number().int().positive(),
    followers: z.string().max(200).optional(),
  }),
  // ADR 0063 point 3: the file of the Pantin folder that was modified outside Pantin.
  file_changed_outside: z.object({ file: ChangedOutsideFileSchema }),
  clock: z.object({}),
  // ADR 0035 point 2: the converter could not prove the face map of this
  // STEP body, so alignment only offers the fallback pick on it. The reason
  // goes to the core log.
  face_file_missing: z.object({}),
  // ADR 0043 points 5 and 11: an emitter's spawn that did not happen (the
  // emitter id), and the products a physics rebuild removed (their count).
  spawn_skipped: z.object({ emitter: EmitterIdSchema }),
  physics_rebuilt: z.object({ products: z.number().int().positive() }),
  // ADR 0045 point 11: a PLC module (its key in io.json) lost or found
  // its connection, and why: its last connection closed, or no request came
  // within its watchdog time. The bridge process itself: same reasons, the
  // bus connection closed or missed its pongs.
  plc_module: z.object({ module: KeySchema }),
  plc_module_lost: z.object({ module: KeySchema, reason: PlcModuleLossReasonSchema }),
  bridge_lost: z.object({ reason: z.enum(["closed", "timeout"]) }),
  // ADR 0050 point 3: the supervised bridge failed; `message` is the bridge's
  // own English text, cut to keep entries small.
  bridge_failed: z.object({ kind: BridgeFailureKindSchema, message: z.string().max(300) }),
  // ADR 0054 point 4: a WARNING or ERROR line of the supervised bridge's log,
  // as written by the bridge without its timestamp, cut to keep entries small.
  bridge_log: z.object({ message: z.string().max(300) }),
  // ADR 0061: a bit feedback tag of a sensor changed (verbose mode only), and
  // how many such entries the budget of a window left out.
  sensor_changed: z.object({ tag: TagNameSchema, value: z.union([z.literal(0), z.literal(1)]) }),
  trace_dropped: z.object({ dropped: z.number().int().positive() }),
};
