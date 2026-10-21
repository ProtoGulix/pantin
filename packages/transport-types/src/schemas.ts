import { z } from "zod";
import {
  MODBUS_PROBLEM_CODES,
  MODBUS_TCP_SLAVE_KIND,
  ModbusChannelPatchSchema,
  ModbusChannelSchema,
  ModbusTcpSlavePatchSchema,
  ModbusTcpSlaveTransportSchema,
} from "./modbus-tcp-slave/schema.ts";

// Registry of the transport schemas, for the protocol (ADR 0064 point 3). Adding
// a transport is one folder and one line in each registry file.

export * from "./modbus-tcp-slave/schema.ts";

export const TRANSPORT_KINDS = [MODBUS_TCP_SLAVE_KIND] as const;
export const TransportKindSchema = z.enum(TRANSPORT_KINDS);
export type TransportKind = z.infer<typeof TransportKindSchema>;

/** The `transport` object of a module, told apart by its `kind`. */
export const TransportConfigSchema = z.discriminatedUnion("kind", [ModbusTcpSlaveTransportSchema]);
export type TransportConfig = z.infer<typeof TransportConfigSchema>;

/** The `transport` object of an edit request. */
export const TransportPatchSchema = z.discriminatedUnion("kind", [ModbusTcpSlavePatchSchema]);
export type TransportPatch = z.infer<typeof TransportPatchSchema>;

// The sub-object a channel carries for its module's transport, named after the transport.
export const CHANNEL_TRANSPORT_SHAPE = { modbus: ModbusChannelSchema.optional() };
export const CHANNEL_PATCH_TRANSPORT_SHAPE = { modbus: ModbusChannelPatchSchema.optional() };
export type ChannelTransportFields = z.infer<z.ZodObject<typeof CHANNEL_TRANSPORT_SHAPE>>;
export type ChannelPatchTransportFields = z.infer<
  z.ZodObject<typeof CHANNEL_PATCH_TRANSPORT_SHAPE>
>;
/** A channel as the transports see it: the common fields plus the sub-object of its transport. */
export type TransportChannel = {
  tag: string;
  variable: string;
  comment: string;
} & ChannelTransportFields;
export type ChannelKey = keyof typeof CHANNEL_TRANSPORT_SHAPE;
export const CHANNEL_KEYS: readonly ChannelKey[] = ["modbus"];

/** Which sub-object each transport's channels carry. */
export const CHANNEL_KEY_BY_KIND: Readonly<Record<TransportKind, ChannelKey>> = {
  [MODBUS_TCP_SLAVE_KIND]: "modbus",
};

/** The problem codes the transports add to the common ones. */
export const TRANSPORT_PROBLEM_CODES = [...MODBUS_PROBLEM_CODES] as const;
export type TransportProblemCode = (typeof TRANSPORT_PROBLEM_CODES)[number];
