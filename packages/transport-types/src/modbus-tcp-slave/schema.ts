import { z } from "zod";

// The Modbus TCP slave transport (ADR 0003, 0045, 0064): Pantin plays the I/O
// modules and the PLC polls them. Data only: the protocol imports this file, so
// it never reaches the rules (ADR 0064 point 3).

export const MODBUS_TCP_SLAVE_KIND = "modbus_tcp_slave";
export const MODBUS_MAX_ADDRESS = 65535;

// The order of the zones is also the order of the channels in the canonical text.
export const IO_ZONES = ["coil", "discrete_input", "holding_register", "input_register"] as const;
export const IoZoneSchema = z.enum(IO_ZONES);
export type IoZone = z.infer<typeof IoZoneSchema>;

// The PLC-side type of a mapped tag: BOOL in a bit zone, REAL (IEEE 754
// single) and DINT over two registers in a register zone.
export const IO_TYPES = ["BOOL", "REAL", "DINT"] as const;
export const IoTypeSchema = z.enum(IO_TYPES);
export type IoType = z.infer<typeof IoTypeSchema>;

export const WORD_ORDERS = ["low_word_first", "high_word_first"] as const;
export const WordOrderSchema = z.enum(WORD_ORDERS);
export type WordOrder = z.infer<typeof WordOrderSchema>;

// Unit id 1..247: the slave addresses of the Modbus over Serial Line
// specification (0 is broadcast, 248..255 reserved), which Modbus TCP keeps in
// its unit identifier field. NOT VERIFIED: recalled, not read for this ADR,
// and a CODESYS master may send another value (spike 4b).
export const MODBUS_UNIT_ID_RANGE = { min: 1, max: 247 } as const;
// Below 100 ms a normal PLC poll (20 to 50 ms, ADR 0045 spike 0003) would
// trip the watchdog on one late request; an hour is the generous end.
export const WATCHDOG_MILLISECONDS_RANGE = { min: 100, max: 3_600_000 } as const;
export const DEFAULT_UNIT_ID = MODBUS_UNIT_ID_RANGE.min;
export const DEFAULT_WORD_ORDER: WordOrder = "low_word_first";
export const DEFAULT_WATCHDOG_MILLISECONDS = 1000;

export const ModbusPortSchema = z.number().int().min(1024).max(65535);
export const ModbusUnitIdSchema = z
  .number()
  .int()
  .min(MODBUS_UNIT_ID_RANGE.min)
  .max(MODBUS_UNIT_ID_RANGE.max);
export const ModbusWatchdogSchema = z
  .number()
  .int()
  .min(WATCHDOG_MILLISECONDS_RANGE.min)
  .max(WATCHDOG_MILLISECONDS_RANGE.max);

/** The settings of a module in io.json; the watchdog is a slave notion, so it lives here. */
export const ModbusTcpSlaveTransportSchema = z.strictObject({
  kind: z.literal(MODBUS_TCP_SLAVE_KIND),
  port: ModbusPortSchema,
  unitId: ModbusUnitIdSchema.default(DEFAULT_UNIT_ID),
  wordOrder: WordOrderSchema.default(DEFAULT_WORD_ORDER),
  watchdogMilliseconds: ModbusWatchdogSchema.default(DEFAULT_WATCHDOG_MILLISECONDS),
});
export type ModbusTcpSlaveTransport = z.infer<typeof ModbusTcpSlaveTransportSchema>;

/** The edit requests: an absent setting means "unchanged" (or "proposed" on creation). */
export const ModbusTcpSlavePatchSchema = z.strictObject({
  kind: z.literal(MODBUS_TCP_SLAVE_KIND),
  port: ModbusPortSchema.optional(),
  unitId: ModbusUnitIdSchema.optional(),
  wordOrder: WordOrderSchema.optional(),
  watchdogMilliseconds: ModbusWatchdogSchema.optional(),
});
export type ModbusTcpSlavePatch = z.infer<typeof ModbusTcpSlavePatchSchema>;

// `zone` and `ioType` could be derived from the tag but are stored: io.json is
// the contract with the PLC program, so a document change that alters a tag
// shows as a problem instead of silently moving a channel (ADR 0049 point 1).
export const ModbusChannelSchema = z.strictObject({
  zone: IoZoneSchema,
  address: z.number().int().min(0).max(MODBUS_MAX_ADDRESS),
  ioType: IoTypeSchema,
});
export type ModbusChannel = z.infer<typeof ModbusChannelSchema>;

/** Only the address is edited by hand; zone and type come from the tag. */
export const ModbusChannelPatchSchema = z.strictObject({
  address: z.number().int().min(0).max(MODBUS_MAX_ADDRESS).optional(),
});
export type ModbusChannelPatch = z.infer<typeof ModbusChannelPatchSchema>;

// Codes of the remarks about wiring a channel to a PLC variable (ADR 0064 point 12).
export const MODBUS_SYMBOL_WARNING_CODES = ["modbus_wire_type_differs"] as const;

export const MODBUS_PROBLEM_CODES = [
  "zone_direction_mismatch",
  "type_mismatch",
  "type_zone_mismatch",
  "address_out_of_range",
  "address_overlap",
] as const;
