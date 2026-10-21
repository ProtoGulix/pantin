import type { SignalType } from "../schema-common.ts";
import { OPCUA_IEC_TYPES_BY_SIGNAL_TYPE, type OpcuaIecType } from "./iec-types.ts";

export function defaultOpcuaIecType(signalType: SignalType): OpcuaIecType {
  return OPCUA_IEC_TYPES_BY_SIGNAL_TYPE[signalType][0];
}

export function isOpcuaIecTypeAllowed(signalType: SignalType, iecType: OpcuaIecType): boolean {
  return OPCUA_IEC_TYPES_BY_SIGNAL_TYPE[signalType].includes(iecType);
}
