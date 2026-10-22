import { MODBUS_TCP_SLAVE_KIND, OPCUA_CLIENT_KIND } from "@pantin/transport-types/schemas";
import { z } from "zod";
import {
  BridgeClientCertificateSchema,
  BridgeFailureKindSchema,
  BridgeServerCertificateSchema,
} from "./bridge-status-lines.ts";
import { KeySchema } from "./ids.ts";
import { PlcModuleLossReasonSchema } from "./plc-link.ts";

// The PLC bridges started and stopped by the core: one per (Pantin, transport kind)
// (ADR 0050, ADR 0065 point 7).
//
//   GET /api/pantins/:pantinId/bridges  -> BridgeListResponse
//        One BridgeStatus per kind of the transport registry, in registry order.
//   PUT /api/pantins/:pantinId/bridges/:kind  the kind's start request -> BridgeStatus
//        modbus_tcp_slave: {running: true, listen, allow} starts (the answer is
//        `starting`); opcua_client: {running: true, targets, passwords?, trust?} starts.
//        {running: false} stops (`stopping`, or the current state when the bridge is
//        already stopped or failed). `bridge_unavailable` when the core has no program
//        for the kind. An unknown kind is a 404. Through the Cloudflare exposure an
//        OPC UA start answers 403 for a non-loopback target, any password, any trust.
//   GET /api/pantins/:pantinId/bridges/:kind/log  -> text/plain; charset=utf-8
//        The kind's bridge log file (ADR 0054), empty when there is none yet;
//        `?download=1` adds `Content-Disposition: attachment;
//        filename="<pantinId>-bridge-<kind>.log"`. 404 for an unknown Pantin or kind.
//
// The pose stream (ADR 0015) also carries the `bridge` event: a BridgeListResponse,
// sent when the stream opens and on every change of any of the Pantin's bridges.

export const BRIDGE_STREAM_EVENT_NAME = "bridge";

export const BRIDGE_MAX_ALLOW_ENTRIES = 16;
export const BRIDGE_MAX_OPCUA_MODULES = 32;
export const BRIDGE_MAX_TARGET_CHARACTERS = 64;
export const BRIDGE_MAX_PASSWORD_CHARACTERS = 256;
export const BRIDGE_MAX_TRUSTED_CERTIFICATES = 16;
export const BRIDGE_MAX_LOG_LINES = 20;
export const BRIDGE_MAX_LOG_LINE_CHARACTERS = 500;

export const BridgeStateSchema = z.enum(["stopped", "starting", "running", "stopping", "failed"]);
export type BridgeState = z.infer<typeof BridgeStateSchema>;

// The settings of the current or last start, per kind. Never a password (ADR 0065 point 9).
export const ModbusBridgeNetworkSchema = z.object({
  listen: z.string(),
  allow: z.array(z.string()),
});
export type ModbusBridgeNetwork = z.infer<typeof ModbusBridgeNetworkSchema>;

// The PLC address of each module, chosen at each start and never saved (ADR 0065 point 8).
export const OpcuaBridgeNetworkSchema = z.object({
  targets: z.record(KeySchema, z.string()),
});
export type OpcuaBridgeNetwork = z.infer<typeof OpcuaBridgeNetworkSchema>;

export type BridgeNetwork = ModbusBridgeNetwork | OpcuaBridgeNetwork;

export const BridgeFailureSchema = z.object({
  kind: BridgeFailureKindSchema,
  message: z.string(),
  exitCode: z.number().int().nullable(),
  signal: z.string().nullable(),
  // The server certificate behind an OPC UA failure, and the module it concerns.
  certificate: BridgeServerCertificateSchema.nullable(),
  module: KeySchema.nullable(),
});
export type BridgeFailure = z.infer<typeof BridgeFailureSchema>;

export const BridgeModuleStatusSchema = z.object({
  key: KeySchema,
  // Modbus: `<listen>:<port>` (the address the PLC connects to). OPC UA:
  // `opc.tcp://<target>:<port><endpointPath>`.
  endpoint: z.string(),
  plcConnected: z.boolean(),
  // The last `plc_status` reason of the module; null when connected or never reported.
  reason: PlcModuleLossReasonSchema.nullable(),
});
export type BridgeModuleStatus = z.infer<typeof BridgeModuleStatusSchema>;

// What every kind reports. `availability` is "unavailable" when the core has no
// program for the kind (Modbus: no --bridge-python).
const COMMON_STATUS_SHAPE = {
  availability: z.enum(["available", "unavailable"]),
  state: BridgeStateSchema,
  // Only the modules of a running bridge.
  modules: z.array(BridgeModuleStatusSchema),
  failure: BridgeFailureSchema.nullable(),
  // The last lines of the bridge's stderr, at most 20 of 500 characters.
  log: z.array(z.string()),
  // A bridge of this kind started outside Pantin holds the bus slot of this Pantin.
  externalBridgeConnected: z.boolean(),
};

// `listenChoices` exists for Modbus only: it is the one kind that listens, so only
// it offers an address of this machine to listen on (ADR 0065 point 4).
export const ModbusBridgeStatusSchema = z.object({
  transport: z.literal(MODBUS_TCP_SLAVE_KIND),
  ...COMMON_STATUS_SHAPE,
  // Null before any start.
  network: ModbusBridgeNetworkSchema.nullable(),
  // 127.0.0.1 first, then the host's private addresses.
  listenChoices: z.array(z.string()),
});
export type ModbusBridgeStatus = z.infer<typeof ModbusBridgeStatusSchema>;

export const OpcuaBridgeStatusSchema = z.object({
  transport: z.literal(OPCUA_CLIENT_KIND),
  ...COMMON_STATUS_SHAPE,
  // Null before any start.
  network: OpcuaBridgeNetworkSchema.nullable(),
  // Pantin's own certificate, from the last `ready` line of this core's run: null until a
  // bridge was ready once. It stays after a stop or a failure, since the user needs its
  // thumbprints to trust Pantin in the PLC, most of all when the connection was refused.
  clientCertificate: BridgeClientCertificateSchema.nullable(),
});
export type OpcuaBridgeStatus = z.infer<typeof OpcuaBridgeStatusSchema>;

export const BridgeStatusSchema = z.discriminatedUnion("transport", [
  ModbusBridgeStatusSchema,
  OpcuaBridgeStatusSchema,
]);
export type BridgeStatus = z.infer<typeof BridgeStatusSchema>;

export const BridgeListResponseSchema = z.object({ bridges: z.array(BridgeStatusSchema) });
export type BridgeListResponse = z.infer<typeof BridgeListResponseSchema>;

export const SetModbusBridgeRequestSchema = z.discriminatedUnion("running", [
  z.strictObject({
    running: z.literal(true),
    listen: z.string().min(1).max(64),
    allow: z.array(z.string().min(1).max(64)).max(BRIDGE_MAX_ALLOW_ENTRIES).default([]),
  }),
  z.strictObject({ running: z.literal(false) }),
]);
export type SetModbusBridgeRequest = z.infer<typeof SetModbusBridgeRequestSchema>;

const BridgeSha256Schema = z.string().regex(/^[0-9a-fA-F]{64}$/, {
  message: "A certificate hash is 64 hexadecimal characters (SHA-256).",
});

// `targets` is one IP address per OPC UA module of the Pantin, chosen at each start and
// never saved (ADR 0065 point 8). `passwords` is optional: an omitted password keeps the one
// the core holds in memory (point 9). `trust` pins server certificates by SHA-256.
export const SetOpcuaBridgeRequestSchema = z.discriminatedUnion("running", [
  z.strictObject({
    running: z.literal(true),
    targets: z
      .record(KeySchema, z.string().min(1).max(BRIDGE_MAX_TARGET_CHARACTERS))
      .refine((targets) => Object.keys(targets).length <= BRIDGE_MAX_OPCUA_MODULES, {
        message: `At most ${BRIDGE_MAX_OPCUA_MODULES} targets.`,
      }),
    passwords: z
      .record(KeySchema, z.string().min(1).max(BRIDGE_MAX_PASSWORD_CHARACTERS))
      .refine((passwords) => Object.keys(passwords).length <= BRIDGE_MAX_OPCUA_MODULES, {
        message: `At most ${BRIDGE_MAX_OPCUA_MODULES} passwords.`,
      })
      .optional(),
    trust: z.array(BridgeSha256Schema).max(BRIDGE_MAX_TRUSTED_CERTIFICATES).optional(),
  }),
  z.strictObject({ running: z.literal(false) }),
]);
export type SetOpcuaBridgeRequest = z.infer<typeof SetOpcuaBridgeRequestSchema>;

// The one line the core writes on the stdin of an OPC UA bridge started with --status-lines,
// then EOF (ADR 0065 point 5): the passwords of its `user` modules, `{}` when none logs in.
// It is the only way a password reaches the child, never the command line or the environment.
export const BridgeStdinLineSchema = z.strictObject({
  passwords: z.record(KeySchema, z.string().min(1).max(BRIDGE_MAX_PASSWORD_CHARACTERS)),
});
export type BridgeStdinLine = z.infer<typeof BridgeStdinLineSchema>;
