import { MODBUS_TCP_SLAVE_RULES } from "./modbus-tcp-slave/rules.ts";
import { OPCUA_CLIENT_RULES } from "./opcua-client/rules.ts";
import type { TransportRules } from "./rule-types.ts";
import type { TransportKind } from "./schemas.ts";

// Registry of the transport rules, for the core (ADR 0064 point 3). The viewer
// never imports it: it shows what the core decided.

export type {
  BridgeModuleFacts,
  ChannelProposal,
  RuleModule,
  SymbolShape,
  TransportProblem,
  TransportRules,
} from "./rule-types.ts";

export const TRANSPORT_RULES: Readonly<Record<TransportKind, TransportRules>> = {
  modbus_tcp_slave: MODBUS_TCP_SLAVE_RULES,
  opcua_client: OPCUA_CLIENT_RULES,
};
