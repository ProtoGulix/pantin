import { TransportKindSchema } from "@pantin/transport-types/schemas";
import { z } from "zod";
import { ApiErrorCodeSchema } from "./api.ts";
import { SimulationClockStateSchema } from "./clock.ts";
import { ConsoleEntrySchema } from "./console.ts";
import { KeySchema } from "./ids.ts";
import { PlcModuleLossReasonSchema } from "./plc-link.ts";
import { TagNameSchema, TagValueSchema } from "./tag.ts";

// The tag bus (ADR 0045 point 4, CLAUDE.md section 9): JSON text frames over a
// WebSocket, between the core and its clients (the PLC bridge today).
//
//   GET /api/pantins/:pantinId/bus  -> upgraded to a WebSocket
//
// The first message of a client is `hello`, within 5 s. A frame is one JSON
// message of at most 64 KiB (TAG_BUS_MAX_MESSAGE_BYTES); a binary frame is a
// protocol error. The core pings every second and ends a connection that sends
// no pong for 3 s. The bridge is not a TypeScript program: it decodes these
// messages by hand and is held to this file by the fixtures of
// packages/protocol/fixtures/tag-bus-messages.json.
//
// The write source is the role of the connection, never a field of a message
// (ADR 0045 point 4): a `client` connection writes as a client and its writes
// force their tag, a `plc` connection writes as the PLC.

// Version 2 (ADR 0065): a plc `hello` names its transport and carries the id of that
// transport's projection of the mapping; there is one plc connection per (Pantin, transport).
export const TAG_BUS_VERSION = 2;
export const TAG_BUS_MAX_MESSAGE_BYTES = 64 * 1024;
export const TAG_BUS_MAX_CONNECTIONS = 16;
export const TAG_BUS_HELLO_TIMEOUT_SECONDS = 5;
export const TAG_BUS_PING_SECONDS = 1;
export const TAG_BUS_PONG_TIMEOUT_SECONDS = 3;

// RFC 6455 section 7.4.2 leaves 4000 to 4999 to applications.
export const TAG_BUS_CLOSE_CODES = {
  invalidMessage: 4000,
  unsupportedVersion: 4001,
  plcAlreadyConnected: 4002,
  // No valid mapping, a different mapping id, or a mapping that changed.
  mappingMismatch: 4003,
  helloTimeout: 4004,
  roleNotAccepted: 4005,
} as const;
export type TagBusCloseCode = (typeof TAG_BUS_CLOSE_CODES)[keyof typeof TAG_BUS_CLOSE_CODES];

export const TagBusRoleSchema = z.enum(["client", "plc"]);
export type TagBusRole = z.infer<typeof TagBusRoleSchema>;

// A correlation id chosen by the sender and echoed in the answer.
const MessageIdSchema = z.string().min(1).max(64);

// SHA-256 of the canonical text of the open mapping, in the core's answer to
// GET .../io (ADR 0049 point 7). Only its presence is checked here: the core
// compares it.
const MappingIdSchema = z.string().min(1).max(128);

// --- client to core ---------------------------------------------------------

// `version` is any positive integer so that an unsupported one is told apart
// from a malformed message (close 4001, not 4000). A plc says which transport it
// serves and which projection of the mapping it was started with; a client has
// neither. A version 1 plc hello has no transport: it is refused by version, not
// as malformed.
const HelloSchema = z
  .object({
    type: z.literal("hello"),
    version: z.number().int().positive(),
    role: TagBusRoleSchema,
    transport: TransportKindSchema.optional(),
    mappingId: MappingIdSchema.optional(),
  })
  .refine((hello) => (hello.role === "plc") === (hello.mappingId !== undefined), {
    message: 'A "plc" hello carries a mappingId, a "client" hello does not.',
  })
  .refine(
    (hello) =>
      hello.role === "plc"
        ? hello.version < TAG_BUS_VERSION || hello.transport !== undefined
        : hello.transport === undefined,
    { message: 'A "plc" hello carries a transport, a "client" hello does not.' },
  );

// Replaces the previous subscription; answered by `snapshot`.
const SubscribeSchema = z.object({
  type: z.literal("subscribe"),
  tags: z.union([z.literal("*"), z.array(TagNameSchema)]),
});

const WriteSchema = z.object({
  type: z.literal("write"),
  id: MessageIdSchema,
  tag: TagNameSchema,
  value: TagValueSchema,
});

// `client` role only. One tag, or `all: true`; never both, never neither.
const ReleaseSchema = z
  .object({
    type: z.literal("release"),
    id: MessageIdSchema,
    tag: TagNameSchema.optional(),
    all: z.literal(true).optional(),
  })
  .refine((release) => (release.tag === undefined) !== (release.all === undefined), {
    message: 'A release names one "tag" or sets "all": true.',
  });

// `plc` role only. A module is connected with no reason, disconnected with the
// reason the bridge saw.
const PlcStatusSchema = z
  .object({
    type: z.literal("plc_status"),
    module: KeySchema,
    connected: z.boolean(),
    reason: PlcModuleLossReasonSchema.nullable(),
  })
  .refine((status) => status.connected === (status.reason === null), {
    message: "A connected module has no reason, a disconnected one has one.",
  });

export const TagBusClientMessageSchema = z.discriminatedUnion("type", [
  HelloSchema,
  SubscribeSchema,
  WriteSchema,
  ReleaseSchema,
  PlcStatusSchema,
]);
export type TagBusClientMessage = z.infer<typeof TagBusClientMessageSchema>;

// --- core to client ---------------------------------------------------------

// A tag as the bus shows it: no type or direction, the client knows them from
// the mapping or from REST.
export const BusTagSchema = z.object({
  name: TagNameSchema,
  value: TagValueSchema,
  forced: z.boolean(),
});
export type BusTag = z.infer<typeof BusTagSchema>;

const WelcomeSchema = z.object({
  type: z.literal("welcome"),
  version: z.literal(TAG_BUS_VERSION),
  // The console's id (ADR 0031): entries sent on this bus belong to it.
  consoleId: z.string().min(1).max(64),
  clock: SimulationClockStateSchema,
});

// `step` is the Pantin's simulation step count when the items were read.
const SnapshotSchema = z.object({
  type: z.literal("snapshot"),
  step: z.number().int().nonnegative(),
  tags: z.array(BusTagSchema),
});

const TagsSchema = z.object({
  type: z.literal("tags"),
  step: z.number().int().nonnegative(),
  tags: z.array(BusTagSchema),
});

// `ignored` is "forced" when a PLC write met a forced tag: `tag` then shows the
// forced value. A release of all tags has no single tag to show.
const AckSchema = z.object({
  type: z.literal("ack"),
  id: MessageIdSchema,
  tag: BusTagSchema.nullable(),
  ignored: z.enum(["forced"]).nullable(),
});

const ErrorSchema = z.object({
  type: z.literal("error"),
  id: MessageIdSchema.nullable(),
  code: ApiErrorCodeSchema,
  message: z.string(),
});

const ConsoleSchema = z.object({ type: z.literal("console"), entry: ConsoleEntrySchema });
const ClockSchema = z.object({ type: z.literal("clock"), clock: SimulationClockStateSchema });
const IoChangedSchema = z.object({ type: z.literal("io_changed") });

export const TagBusServerMessageSchema = z.discriminatedUnion("type", [
  WelcomeSchema,
  SnapshotSchema,
  TagsSchema,
  AckSchema,
  ErrorSchema,
  ConsoleSchema,
  ClockSchema,
  IoChangedSchema,
]);
export type TagBusServerMessage = z.infer<typeof TagBusServerMessageSchema>;
