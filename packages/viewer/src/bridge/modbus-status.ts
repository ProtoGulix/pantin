import {
  type BridgeListResponse,
  MODBUS_TCP_SLAVE_KIND,
  type ModbusBridgeStatus,
} from "@pantin/protocol";

// The viewer's bridge card shows the Modbus bridge only until the card per kind arrives
// (ADR 0065 slice S2d): this picks its status out of the list the core sends.
export function modbusStatusOf(list: BridgeListResponse): ModbusBridgeStatus | undefined {
  return list.bridges.find(
    (status): status is ModbusBridgeStatus => status.transport === MODBUS_TCP_SLAVE_KIND,
  );
}
