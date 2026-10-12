import { z } from "zod";

// Ids become folder and file names. The pattern excludes dots and slashes, so
// an id can never escape its parent directory ("..", "a/b", "/etc").
const SAFE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function safeIdSchema() {
  return z
    .string()
    .regex(
      SAFE_ID_PATTERN,
      "Must be 1 to 64 lowercase letters, digits or dashes, not at the ends.",
    );
}

export const PantinIdSchema = safeIdSchema();
export type PantinId = z.infer<typeof PantinIdSchema>;

export const BodyIdSchema = safeIdSchema();
export type BodyId = z.infer<typeof BodyIdSchema>;

export const JointIdSchema = safeIdSchema();
export type JointId = z.infer<typeof JointIdSchema>;
export const DriveIdSchema = safeIdSchema();
export type DriveId = z.infer<typeof DriveIdSchema>;
export const ActuatorIdSchema = safeIdSchema();
export type ActuatorId = z.infer<typeof ActuatorIdSchema>;
export const SensorIdSchema = safeIdSchema();
export type SensorId = z.infer<typeof SensorIdSchema>;
export const BeltIdSchema = safeIdSchema();
export type BeltId = z.infer<typeof BeltIdSchema>;
export const GuideIdSchema = safeIdSchema();
export type GuideId = z.infer<typeof GuideIdSchema>;
export const EmitterIdSchema = safeIdSchema();
export type EmitterId = z.infer<typeof EmitterIdSchema>;
export const AbsorberIdSchema = safeIdSchema();
export type AbsorberId = z.infer<typeof AbsorberIdSchema>;
export const PresenceSensorIdSchema = safeIdSchema();
export type PresenceSensorId = z.infer<typeof PresenceSensorIdSchema>;

// Keys name the segments of a tag (ADR 0019): like ids, plus "_" so that a
// tag reads like a PLC variable, "verin_pince.tige.position". Never a dot:
// it separates the segments.
export const KEY_PATTERN_SOURCE = "[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?";
const KEY_PATTERN = new RegExp(`^${KEY_PATTERN_SOURCE}$`);

export const KeySchema = z
  .string()
  .regex(
    KEY_PATTERN,
    "Must be 1 to 64 lowercase letters, digits, dashes or underscores, a letter or digit at both ends.",
  );
export type Key = z.infer<typeof KeySchema>;

export const DisplayNameSchema = z
  .string()
  .trim()
  .min(1, "Name must not be empty.")
  .max(200, "Name must be at most 200 characters.");
