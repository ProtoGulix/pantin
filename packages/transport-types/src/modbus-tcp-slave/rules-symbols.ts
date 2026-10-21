import type { SymbolShape } from "../rule-types.ts";
import type { TransportChannel } from "../schemas.ts";

// A Modbus channel carries one wire type (BOOL, REAL or DINT over two registers). A
// PLC variable of another IEC type behind it would be read at the wrong width, so it is
// worth a warning. The access of the variable does not matter: Modbus has no such notion.

export function modbusSymbolWarnings(channel: TransportChannel, symbol: SymbolShape): string[] {
  const wireType = channel.modbus?.ioType;
  if (wireType === undefined || symbol.iecType.trim().toUpperCase() === wireType) {
    return [];
  }
  return [
    `The Modbus channel carries ${wireType} but the PLC variable is ${symbol.iecType}: map it as ${wireType} in the PLC or change the variable.`,
  ];
}
