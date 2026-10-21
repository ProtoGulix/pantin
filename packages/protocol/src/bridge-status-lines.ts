import { MODBUS_TCP_SLAVE_KIND, OPCUA_CLIENT_KIND } from "@pantin/transport-types/schemas";
import { z } from "zod";
import { KeySchema } from "./ids.ts";

// What a bridge writes on stdout under --status-lines (ADR 0050 point 2, ADR 0065
// points 5 and 7). Shared by every bridge, whatever its transport.

// Largest status line the bridge writes on stdout; a longer line is a log line.
export const BRIDGE_MAX_STATUS_LINE_BYTES = 4096;

// The kinds the bridge reports itself in its `exiting` line.
export const BRIDGE_EXIT_KINDS = [
  "configuration",
  "core_unavailable",
  "mapping_not_valid",
  "mapping_changed",
  "bus_closed",
  "protocol",
  "unexpected",
  // OPC UA client only (ADR 0065 point 10): the server's certificate or login.
  "untrusted_server_certificate",
  "server_certificate_invalid",
  "authentication_failed",
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

// The certificate a PLC server presented and the bridge did not accept, with why.
export const BridgeServerCertificateSchema = z.strictObject({
  subject: z.string(),
  notBefore: z.string(),
  notAfter: z.string(),
  sha256: z.string().min(1),
  sha1: z.string().min(1),
  reason: z.string(),
});
export type BridgeServerCertificate = z.infer<typeof BridgeServerCertificateSchema>;

// Pantin's own certificate, shown so that the user can trust it in the PLC.
export const BridgeClientCertificateSchema = z.strictObject({
  subject: z.string(),
  applicationUri: z.string(),
  sha256: z.string().min(1),
  sha1: z.string().min(1),
});
export type BridgeClientCertificate = z.infer<typeof BridgeClientCertificateSchema>;

// Strict, like the shared fixture says: an unknown field means the two sides
// drifted apart.
const ModbusReadyLineSchema = z.strictObject({
  event: z.literal("ready"),
  transport: z.literal(MODBUS_TCP_SLAVE_KIND),
  listen: z.string().min(1),
  modules: z.array(z.strictObject({ key: KeySchema, port: z.number().int().min(1).max(65535) })),
});
const OpcuaReadyLineSchema = z.strictObject({
  event: z.literal("ready"),
  transport: z.literal(OPCUA_CLIENT_KIND),
  modules: z.array(z.strictObject({ key: KeySchema, endpoint: z.string().min(1) })),
  clientCertificate: BridgeClientCertificateSchema,
});
const ExitingLineSchema = z.strictObject({
  event: z.literal("exiting"),
  kind: BridgeExitKindSchema,
  message: z.string(),
  certificate: BridgeServerCertificateSchema.nullable(),
  module: KeySchema.nullable(),
});

export const BridgeStatusLineSchema = z.discriminatedUnion("event", [
  z.discriminatedUnion("transport", [ModbusReadyLineSchema, OpcuaReadyLineSchema]),
  ExitingLineSchema,
]);
export type BridgeStatusLine = z.infer<typeof BridgeStatusLineSchema>;
