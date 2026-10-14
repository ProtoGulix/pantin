import { z } from "zod";
import { KeySchema } from "./ids.ts";

// The PLC bridge started and stopped by the core (ADR 0050).
//
//   GET /api/pantins/:pantinId/bridge  -> BridgeStatus
//   PUT /api/pantins/:pantinId/bridge  SetBridgeRequest -> BridgeStatus
//        {running: true, listen, allow}: start (the answer is `starting`);
//        {running: false}: stop (`stopping`, or the current state when the
//        bridge is already stopped or failed). 403 under the cloudflare
//        exposure header; `bridge_unavailable` without --bridge-python.
//
// The pose stream (ADR 0015) also carries the `bridge` event: a BridgeStatus,
// sent when the stream opens and on every change of it.

export const BRIDGE_STREAM_EVENT_NAME = "bridge";

// Largest status line the bridge writes on stdout; a longer line is a log line.
export const BRIDGE_MAX_STATUS_LINE_BYTES = 4096;
export const BRIDGE_MAX_ALLOW_ENTRIES = 16;
export const BRIDGE_MAX_LOG_LINES = 20;
export const BRIDGE_MAX_LOG_LINE_CHARACTERS = 500;

// The kinds the bridge reports itself in its `exiting` line.
export const BRIDGE_EXIT_KINDS = [
  "configuration",
  "core_unavailable",
  "mapping_not_valid",
  "mapping_changed",
  "bus_closed",
  "protocol",
  "unexpected",
] as const;
export const BridgeExitKindSchema = z.enum(BRIDGE_EXIT_KINDS);
export type BridgeExitKind = z.infer<typeof BridgeExitKindSchema>;

// The kinds the core adds when the bridge could not say (ADR 0050 point 3).
export const BRIDGE_FAILURE_KINDS = [
  ...BRIDGE_EXIT_KINDS,
  "spawn_failed",
  "start_timeout",
  "crashed",
] as const;
export const BridgeFailureKindSchema = z.enum(BRIDGE_FAILURE_KINDS);
export type BridgeFailureKind = z.infer<typeof BridgeFailureKindSchema>;

// One JSON line of the bridge's stdout under --status-lines. Strict, like the
// shared fixture says: an unknown field means the two sides drifted apart.
const BridgeReadyModuleSchema = z.strictObject({
  key: KeySchema,
  port: z.number().int().min(1).max(65535),
});
export const BridgeStatusLineSchema = z.discriminatedUnion("event", [
  z.strictObject({
    event: z.literal("ready"),
    listen: z.string().min(1),
    modules: z.array(BridgeReadyModuleSchema),
  }),
  z.strictObject({
    event: z.literal("exiting"),
    kind: BridgeExitKindSchema,
    message: z.string(),
  }),
]);
export type BridgeStatusLine = z.infer<typeof BridgeStatusLineSchema>;

export const BridgeStateSchema = z.enum(["stopped", "starting", "running", "stopping", "failed"]);
export type BridgeState = z.infer<typeof BridgeStateSchema>;

export const BridgeNetworkSchema = z.object({
  listen: z.string(),
  allow: z.array(z.string()),
});
export type BridgeNetwork = z.infer<typeof BridgeNetworkSchema>;

export const BridgeFailureSchema = z.object({
  kind: BridgeFailureKindSchema,
  message: z.string(),
  exitCode: z.number().int().nullable(),
  signal: z.string().nullable(),
});
export type BridgeFailure = z.infer<typeof BridgeFailureSchema>;

export const BridgeStatusSchema = z.object({
  // "unavailable" when the core was started without --bridge-python.
  availability: z.enum(["available", "unavailable"]),
  state: BridgeStateSchema,
  // Listen address and allow list of the current or last start; null before any.
  network: BridgeNetworkSchema.nullable(),
  // The modules while running, each with whether the PLC is connected to it.
  modules: z.array(z.object({ key: KeySchema, port: z.number().int(), plcConnected: z.boolean() })),
  failure: BridgeFailureSchema.nullable(),
  // The last lines of the bridge's stderr, at most 20 of 500 characters.
  log: z.array(z.string()),
  // A bridge started outside Pantin holds the bus slot of this Pantin.
  externalBridgeConnected: z.boolean(),
  // 127.0.0.1 first, then the host's private addresses.
  listenChoices: z.array(z.string()),
});
export type BridgeStatus = z.infer<typeof BridgeStatusSchema>;

export const SetBridgeRequestSchema = z.discriminatedUnion("running", [
  z.strictObject({
    running: z.literal(true),
    listen: z.string().min(1).max(64),
    allow: z.array(z.string().min(1).max(64)).max(BRIDGE_MAX_ALLOW_ENTRIES).default([]),
  }),
  z.strictObject({ running: z.literal(false) }),
]);
export type SetBridgeRequest = z.infer<typeof SetBridgeRequestSchema>;
