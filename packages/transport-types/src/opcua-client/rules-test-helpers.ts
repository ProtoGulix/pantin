import type { RuleModule } from "../rule-types.ts";
import type { SignalShape } from "../schema-common.ts";
import { type TransportChannel, TransportPatchSchema } from "../schemas.ts";
import { OPCUA_CLIENT_RULES as rules } from "./rules.ts";
import { OPCUA_CLIENT_KIND, type OpcuaClientTransport, OpcuaIecTypeSchema } from "./schema.ts";

// Shared by the OPC UA rule tests.

export function created(patch: object = {}): OpcuaClientTransport {
  const settings = rules.createTransport(
    TransportPatchSchema.parse({ kind: OPCUA_CLIENT_KIND, ...patch }),
    [],
  );
  if (typeof settings === "string" || settings.kind !== OPCUA_CLIENT_KIND) {
    throw new Error("expected OPC UA settings");
  }
  return settings;
}

export function moduleOf(
  transport: OpcuaClientTransport,
  channels: readonly TransportChannel[] = [],
): RuleModule {
  return { key: "plc", transport, channels };
}

export function channelOf(
  tag: string,
  identifier: string | null,
  iecType = "BOOL",
): TransportChannel {
  return {
    tag,
    variable: tag,
    comment: "",
    opcua: { identifier, iecType: OpcuaIecTypeSchema.parse(iecType) },
  };
}

export const BIT_COMMAND: SignalShape = { type: "bit", direction: "command" };
export const signals = (entries: Record<string, SignalShape>) => new Map(Object.entries(entries));
