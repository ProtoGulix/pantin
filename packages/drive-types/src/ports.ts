import { z } from "zod";

// Port states (ADR 0028 point 2): data only, no logic, so that the protocol
// and @pantin/actuator-types may import them. A drive type declares its named
// output ports and their domain in its schema.ts; an actuator reads them.

export const PORT_DOMAINS = ["pneumatic", "ac_power", "servo"] as const;
export type PortDomain = (typeof PORT_DOMAINS)[number];

/** A named output port of a drive type, and the domain of what it carries. */
export interface DrivePort {
  name: string;
  domain: PortDomain;
}

/** What a working port of a valve does to its chamber. */
export const PneumaticStateSchema = z.enum(["pressure", "exhaust", "blocked"]);
export type PneumaticState = z.infer<typeof PneumaticStateSchema>;

/** Direction of rotation (0 is stopped) and the share of the nominal speed. */
export const AcPowerStateSchema = z.object({
  direction: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  ratio: z.number().min(0).max(1),
});
export type AcPowerState = z.infer<typeof AcPowerStateSchema>;

/** In the unit of the joints the actuator moves, per second and per second squared. */
export const ServoStateSchema = z.object({
  setpoint: z.number(),
  // Strictly positive: the trapezoidal profile divides by neither, but takes a
  // square root that is NaN for a negative acceleration.
  maxSpeed: z.number().positive(),
  maxAcceleration: z.number().positive(),
});
export type ServoState = z.infer<typeof ServoStateSchema>;

export const PORT_STATE_SCHEMAS = {
  pneumatic: PneumaticStateSchema,
  ac_power: AcPowerStateSchema,
  servo: ServoStateSchema,
} as const satisfies Record<PortDomain, z.ZodType>;

export type PortState = PneumaticState | AcPowerState | ServoState;
