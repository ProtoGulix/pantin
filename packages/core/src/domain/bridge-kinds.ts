import {
  type BridgeNetwork,
  type BridgeStatusLine,
  type MODBUS_TCP_SLAVE_KIND,
  OPCUA_CLIENT_KIND,
  SetModbusBridgeRequestSchema,
  SetOpcuaBridgeRequestSchema,
  type TransportKind,
} from "@pantin/protocol";
import type { BridgeRefusal, BridgeStartFacts } from "./bridge-checks.ts";
import { hostAndPort } from "./bridge-output.ts";
import type { BridgeReadyModule } from "./bridge-state.ts";
import { checkModbusStart, modbusArguments } from "./modbus-bridge-start.ts";
import { checkOpcuaStart, type OpcuaStartRequest, opcuaArguments } from "./opcua-bridge-start.ts";
import { parseWithSchema } from "./validation.ts";

// What differs from one kind of bridge to the next, in one place (ADR 0065 point 4): the
// start request a kind takes, the plan that request becomes, and how a `ready` line
// reads. With bridge-status.ts, this is the only domain code that names kinds.

/** A start request, tagged by the kind it is for. */
export type BridgeStartRequest =
  | { kind: typeof MODBUS_TCP_SLAVE_KIND; listen: string; allow: readonly string[] }
  | ({ kind: typeof OPCUA_CLIENT_KIND } & OpcuaStartRequest);

export type BridgeCommand = { running: false } | { running: true; start: BridgeStartRequest };

/**
 * What a checked start request becomes: the settings to report, the address the bridge
 * listens on (null for a kind that connects out), the kind's part of the command line, the
 * passwords to hand over on stdin (null when the kind takes none) and the modules that
 * deserve the console warning `opcua_unsecured_lan`.
 */
export type BridgePlan = {
  network: BridgeNetwork;
  listen: string | null;
  kindArguments: string[];
  passwords: Record<string, string> | null;
  unsecuredLanModules: string[];
};

export type BridgePlanResult =
  | { ok: true; plan: BridgePlan }
  | { ok: false; refusal: BridgeRefusal };

/**
 * Reads the body of `PUT .../bridges/:kind` with the kind's own schema. `viaExposure` is
 * true for a request that came through the Cloudflare exposure.
 */
export function parseBridgeCommand(
  kind: TransportKind,
  body: unknown,
  viaExposure = false,
): BridgeCommand {
  const context = "The bridge request";
  if (kind === OPCUA_CLIENT_KIND) {
    const request = parseWithSchema(SetOpcuaBridgeRequestSchema, body, context);
    return request.running
      ? {
          running: true,
          start: {
            kind,
            targets: request.targets,
            passwords: request.passwords ?? {},
            trust: request.trust ?? [],
            viaExposure,
          },
        }
      : { running: false };
  }
  const request = parseWithSchema(SetModbusBridgeRequestSchema, body, context);
  return request.running
    ? { running: true, start: { kind, listen: request.listen, allow: request.allow } }
    : { running: false };
}

/** Checks a start request against the facts; the kind's own rules come first. */
export function planBridgeStart(
  pantinId: string,
  request: BridgeStartRequest,
  facts: BridgeStartFacts,
): BridgePlanResult {
  if (request.kind === OPCUA_CLIENT_KIND) {
    const result = checkOpcuaStart(pantinId, request, facts);
    return result.ok
      ? {
          ok: true,
          plan: {
            network: result.plan.network,
            listen: null,
            kindArguments: opcuaArguments(result.plan),
            passwords: result.plan.passwords,
            unsecuredLanModules: result.plan.unsecuredLanModules,
          },
        }
      : result;
  }
  const result = checkModbusStart(pantinId, request, facts);
  return result.ok
    ? {
        ok: true,
        plan: {
          network: result.network,
          listen: result.network.listen,
          kindArguments: modbusArguments(result.network),
          passwords: null,
          unsecuredLanModules: [],
        },
      }
    : result;
}

/** The modules of a `ready` line, with where each one is reached. */
export function readyModulesOf(
  line: Extract<BridgeStatusLine, { event: "ready" }>,
): BridgeReadyModule[] {
  if (line.transport === OPCUA_CLIENT_KIND) {
    return line.modules;
  }
  return line.modules.map(({ key, port }) => ({ key, endpoint: hostAndPort(line.listen, port) }));
}

/** What to tell the user when the core has no program for a kind, or cannot run it. */
export const LAUNCHER_ADVICE: Readonly<Record<TransportKind, { missing: string; failed: string }>> =
  {
    modbus_tcp_slave: {
      missing:
        "start the core with --bridge-python <python of the bridge venv> (pnpm setup:python)",
      failed: "Run pnpm setup:python.",
    },
    opcua_client: {
      missing: "start the core with --opcua-bridge <entry of the OPC UA bridge>",
      failed: "Check the file the core was started with in --opcua-bridge.",
    },
  };
