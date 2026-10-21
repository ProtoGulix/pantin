import type { RuleModule, TransportProblem } from "../rule-types.ts";
import type { SignalShape } from "../schema-common.ts";
import { isOpcuaIecTypeAllowed, OPCUA_IEC_TYPES_BY_SIGNAL_TYPE } from "./iec-types.ts";
import { isExplicitIdentifierValid } from "./rules-identifiers.ts";
import { OPCUA_CLIENT_KIND, type OpcuaClientTransport } from "./schema.ts";

// The OPC UA rules of one module (ADR 0065 point 2). `gvl_name_mismatch` compares several
// modules, so the core makes that check through `variableScope`.

function settingsOf(module: RuleModule): OpcuaClientTransport | null {
  return module.transport.kind === OPCUA_CLIENT_KIND ? module.transport : null;
}

function moduleProblems(transport: OpcuaClientTransport): TransportProblem[] {
  const problems: TransportProblem[] = [];
  if ((transport.securityMode === "None") !== (transport.securityPolicy === "None")) {
    problems.push({
      path: ["transport", "securityPolicy"],
      code: "security_mismatch",
      message: `Security mode ${transport.securityMode} and policy ${transport.securityPolicy} do not go together: both are None, or neither is.`,
    });
  }
  if (transport.namespaceUri === "") {
    problems.push({
      path: ["transport", "namespaceUri"],
      code: "namespace_missing",
      message:
        "The module has no namespace URI: copy the PLC's variable namespace into it (the bridge lists the server's namespaces when it does not find yours).",
    });
  }
  return problems;
}

function channelProblems(
  module: RuleModule,
  signals: ReadonlyMap<string, SignalShape>,
): TransportProblem[] {
  return module.channels.flatMap((channel, index) => {
    const { opcua } = channel;
    if (opcua === undefined) {
      return [];
    }
    const problems: TransportProblem[] = [];
    if (opcua.identifier !== null && !isExplicitIdentifierValid(opcua.identifier)) {
      problems.push({
        path: ["channels", index, "opcua", "identifier"],
        code: "identifier_invalid",
        message: `Identifier "${opcua.identifier}" of tag "${channel.tag}" is not s=<name> or i=<number>. Leave it empty to derive it from the variable.`,
      });
    }
    const signal = signals.get(channel.tag);
    if (signal !== undefined && !isOpcuaIecTypeAllowed(signal.type, opcua.iecType)) {
      const allowed = OPCUA_IEC_TYPES_BY_SIGNAL_TYPE[signal.type].join(" or ");
      problems.push({
        path: ["channels", index, "opcua", "iecType"],
        code: "iec_type_mismatch",
        message: `Tag "${channel.tag}" is a ${signal.type}: its type is ${allowed}, not ${opcua.iecType}.`,
      });
    }
    return problems;
  });
}

export function validateOpcuaModule(
  module: RuleModule,
  signals: ReadonlyMap<string, SignalShape>,
): TransportProblem[] {
  const transport = settingsOf(module);
  return transport === null
    ? []
    : [...moduleProblems(transport), ...channelProblems(module, signals)];
}
