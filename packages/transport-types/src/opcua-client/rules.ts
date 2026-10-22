import type {
  BridgeModuleFacts,
  ChannelProposal,
  RuleModule,
  SymbolShape,
  TransportRules,
  TransportSymbolWarning,
} from "../rule-types.ts";
import type { SignalShape } from "../schema-common.ts";
import type {
  ChannelMappedFields,
  ChannelPatchTransportFields,
  ChannelTransportFields,
  TransportChannel,
  TransportConfig,
  TransportPatch,
} from "../schemas.ts";
import { resolvedIdentifier } from "./rules-identifiers.ts";
import { defaultOpcuaIecType, isOpcuaIecTypeAllowed } from "./rules-iec-types.ts";
import { validateOpcuaModule } from "./rules-validation.ts";
import {
  OPCUA_CLIENT_KIND,
  OPCUA_DEFAULT_GVL_NAME,
  OPCUA_DEFAULT_NODE_ID_PREFIX,
  OPCUA_DEFAULT_PORT,
  OPCUA_DEFAULT_PUBLISHING_MILLISECONDS,
  OPCUA_DEFAULT_SAMPLING_MILLISECONDS,
  OPCUA_DEFAULT_SECURITY_MODE,
  OPCUA_DEFAULT_SECURITY_POLICY,
  OPCUA_DEFAULT_WATCHDOG_MILLISECONDS,
  type OpcuaAuth,
  type OpcuaClientPatch,
  type OpcuaClientTransport,
} from "./schema.ts";

// The OPC UA client rules of the transport registry (ADR 0065). Pure.

function opcuaTransportOf(transport: TransportConfig): OpcuaClientTransport {
  if (transport.kind !== OPCUA_CLIENT_KIND) {
    throw new Error(`OPC UA rules were given a "${transport.kind}" module.`);
  }
  return transport;
}

function opcuaPatchOf(patch: TransportPatch): OpcuaClientPatch {
  if (patch.kind !== OPCUA_CLIENT_KIND) {
    throw new Error(`OPC UA rules were given a "${patch.kind}" edit.`);
  }
  return patch;
}

// Keys are listed one by one so that the text does not depend on how the object was built.
function orderedAuth(auth: OpcuaAuth): OpcuaAuth {
  return auth.kind === "user" ? { kind: "user", userName: auth.userName } : { kind: "anonymous" };
}

function createTransport(patch: TransportPatch): OpcuaClientTransport {
  const edit = opcuaPatchOf(patch);
  return {
    kind: OPCUA_CLIENT_KIND,
    port: edit.port ?? OPCUA_DEFAULT_PORT,
    endpointPath: edit.endpointPath ?? "",
    securityMode: edit.securityMode ?? OPCUA_DEFAULT_SECURITY_MODE,
    securityPolicy: edit.securityPolicy ?? OPCUA_DEFAULT_SECURITY_POLICY,
    auth: orderedAuth(edit.auth ?? { kind: "anonymous" }),
    // Empty on purpose: the problem namespace_missing keeps the mapping invalid until the
    // user fills it in, since no default would be right for every PLC.
    namespaceUri: edit.namespaceUri ?? "",
    nodeIdPrefix: edit.nodeIdPrefix ?? OPCUA_DEFAULT_NODE_ID_PREFIX,
    gvlName: edit.gvlName ?? OPCUA_DEFAULT_GVL_NAME,
    samplingMilliseconds: edit.samplingMilliseconds ?? OPCUA_DEFAULT_SAMPLING_MILLISECONDS,
    publishingMilliseconds: edit.publishingMilliseconds ?? OPCUA_DEFAULT_PUBLISHING_MILLISECONDS,
    watchdogMilliseconds: edit.watchdogMilliseconds ?? OPCUA_DEFAULT_WATCHDOG_MILLISECONDS,
  };
}

// An absent field means "unchanged": spreading `undefined` would erase it.
function patchTransport(transport: TransportConfig, patch: TransportPatch): TransportConfig {
  const current = opcuaTransportOf(transport);
  const edit = opcuaPatchOf(patch);
  return {
    kind: current.kind,
    port: edit.port ?? current.port,
    endpointPath: edit.endpointPath ?? current.endpointPath,
    securityMode: edit.securityMode ?? current.securityMode,
    securityPolicy: edit.securityPolicy ?? current.securityPolicy,
    auth: orderedAuth(edit.auth ?? current.auth),
    namespaceUri: edit.namespaceUri ?? current.namespaceUri,
    nodeIdPrefix: edit.nodeIdPrefix ?? current.nodeIdPrefix,
    gvlName: edit.gvlName ?? current.gvlName,
    samplingMilliseconds: edit.samplingMilliseconds ?? current.samplingMilliseconds,
    publishingMilliseconds: edit.publishingMilliseconds ?? current.publishingMilliseconds,
    watchdogMilliseconds: edit.watchdogMilliseconds ?? current.watchdogMilliseconds,
  };
}

function orderedTransport(transport: TransportConfig): TransportConfig {
  return patchTransport(transport, { kind: OPCUA_CLIENT_KIND });
}

function proposeChannel(_module: RuleModule, signal: SignalShape): ChannelProposal {
  return { fields: { opcua: { identifier: null, iecType: defaultOpcuaIecType(signal.type) } } };
}

// An explicit identifier belongs to one server's namespace, so a channel moved to another
// module goes back to the derived one. The IEC type stays when the signal still allows it.
function reshapeChannel(
  module: RuleModule,
  channel: TransportChannel,
  signal: SignalShape,
  moved: boolean,
): ChannelProposal {
  const current = channel.opcua;
  if (current === undefined) {
    return proposeChannel(module, signal);
  }
  return {
    fields: {
      opcua: {
        identifier: moved ? null : current.identifier,
        iecType: isOpcuaIecTypeAllowed(signal.type, current.iecType)
          ? current.iecType
          : defaultOpcuaIecType(signal.type),
      },
    },
  };
}

function patchChannel(
  channel: TransportChannel,
  patch: ChannelPatchTransportFields,
): ChannelTransportFields {
  if (channel.opcua === undefined) {
    return {};
  }
  return {
    opcua: {
      identifier:
        patch.opcua?.identifier === undefined ? channel.opcua.identifier : patch.opcua.identifier,
      iecType: patch.opcua?.iecType ?? channel.opcua.iecType,
    },
  };
}

function orderedChannelFields(channel: TransportChannel): ChannelTransportFields {
  const { opcua } = channel;
  return opcua === undefined
    ? {}
    : { opcua: { identifier: opcua.identifier, iecType: opcua.iecType } };
}

function compareChannels(first: TransportChannel, second: TransportChannel): number {
  // Code units, not a locale: the order must be the same on every machine.
  return first.tag < second.tag ? -1 : first.tag > second.tag ? 1 : 0;
}

// ADR 0065 point 12: Pantin reads a command from the PLC and writes a feedback to it, so a
// command needs a readable variable and a feedback a writable one. An unknown access is not
// judged.
function accessWarnings(signal: SignalShape, symbol: SymbolShape): TransportSymbolWarning[] {
  const { access } = symbol;
  const canRead = access === "read" || access === "read_write";
  const canWrite = access === "write" || access === "read_write";
  if (signal.direction === "command" && access !== "unknown" && !canRead) {
    return [
      {
        code: "opcua_command_not_readable",
        values: { access },
        message: `The PLC variable is ${access} only, but Pantin reads this command from it: make it readable.`,
      },
    ];
  }
  if (signal.direction === "feedback" && access !== "unknown" && !canWrite) {
    return [
      {
        code: "opcua_feedback_not_writable",
        values: { access },
        message: `The PLC variable is ${access} only, but Pantin writes this feedback to it: make it writable.`,
      },
    ];
  }
  return [];
}

function symbolWarnings(
  channel: TransportChannel,
  symbol: SymbolShape,
  signal: SignalShape,
): TransportSymbolWarning[] {
  const iecType = channel.opcua?.iecType;
  const typeWarnings: TransportSymbolWarning[] =
    iecType === undefined || symbol.iecType.trim().toUpperCase() === iecType
      ? []
      : [
          {
            code: "opcua_type_differs",
            values: { channelType: iecType, variableType: symbol.iecType },
            message: `The OPC UA channel is ${iecType} but the PLC variable is ${symbol.iecType}: change the type of the PLC variable to ${iecType}.`,
          },
        ];
  return [...typeWarnings, ...accessWarnings(signal, symbol)];
}

function resolvedChannelFields(
  transport: TransportConfig,
  channel: TransportChannel,
): ChannelMappedFields {
  if (channel.opcua === undefined) {
    return {};
  }
  const settings = opcuaTransportOf(transport);
  return {
    opcua: {
      identifier: channel.opcua.identifier,
      iecType: channel.opcua.iecType,
      resolvedIdentifier: resolvedIdentifier(settings, {
        variable: channel.variable,
        identifier: channel.opcua.identifier,
      }),
    },
  };
}

function bridgeModules(modules: readonly RuleModule[]): BridgeModuleFacts[] {
  return modules.flatMap((module) =>
    module.transport.kind === OPCUA_CLIENT_KIND ? [{ key: module.key, port: null }] : [],
  );
}

export const OPCUA_CLIENT_RULES: TransportRules = {
  kind: OPCUA_CLIENT_KIND,
  network: "connects",
  bridgeModules,
  variableScope: (transport) => opcuaTransportOf(transport).gvlName,
  resolvedChannelFields,
  // Every (type, direction) pair is carried (ADR 0065 point 2).
  supportsSignal: () => true,
  // A client listens on nothing.
  listenPort: () => null,
  createTransport,
  patchTransport,
  orderedTransport,
  proposeChannel,
  reshapeChannel,
  patchChannel,
  orderedChannelFields,
  compareChannels,
  symbolWarnings,
  validateModule: validateOpcuaModule,
};
