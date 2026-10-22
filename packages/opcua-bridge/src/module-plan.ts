import { classifyAddress } from "@pantin/network-address";
import {
  type IoMappingResponse,
  OPCUA_CLIENT_KIND,
  type OpcuaClientTransport,
  type OpcuaIecType,
  type TagDirection,
} from "@pantin/protocol";
import { ConfigurationError, MappingNotValidError, ProtocolError } from "./errors.ts";

// What the bridge serves: the OPC UA modules of the core's projection of the mapping, each
// with its PLC's address, its login and its nodes (ADR 0065 points 2, 3 and 9). Pure: the
// effects (fetching, reading stdin) happen before, at the boundaries.

/** One tag and the node it is bound to. The core derived the identifier (point 3). */
export type NodeSignal = {
  tag: string;
  direction: TagDirection;
  identifier: string;
  iecType: OpcuaIecType;
};

// The password is part of the login only: nothing here is ever logged or serialised.
type Login = { kind: "anonymous" } | { kind: "user"; userName: string; password: string };

export type ModulePlan = {
  key: string;
  transport: OpcuaClientTransport;
  /** The normalised address of the PLC (ADR 0065 point 8). */
  target: string;
  /** `opc.tcp://<target>:<port><endpointPath>`, IPv6 in brackets. */
  endpoint: string;
  login: Login;
  signals: readonly NodeSignal[];
};

export type BridgePlan = { mappingId: string; modules: readonly ModulePlan[] };

function describePath(path: readonly (string | number)[]): string {
  const text = path.map((part) => (typeof part === "number" ? `[${part}]` : `.${part}`)).join("");
  return text === "" ? "io.json" : text.replace(/^\./, "");
}

function requireValidMapping(projection: IoMappingResponse): string {
  if (projection.status === "valid" && projection.mappingId !== null) {
    return projection.mappingId;
  }
  const reasons = projection.problems
    .map((problem) => `${describePath(problem.path)}: ${problem.message}`)
    .join("; ");
  throw new MappingNotValidError(
    `The io mapping is ${projection.status}${reasons === "" ? " (map the tags in the viewer's I/O view, or run `pantin io init`)." : `: ${reasons}`}`,
  );
}

export function endpointOf(transport: OpcuaClientTransport, target: string): string {
  const host = target.includes(":") ? `[${target}]` : target;
  return `opc.tcp://${host}:${transport.port}${transport.endpointPath}`;
}

function loginOf(
  key: string,
  transport: OpcuaClientTransport,
  passwords: ReadonlyMap<string, string>,
  startedByCore: boolean,
): Login {
  if (transport.auth.kind === "anonymous") {
    return { kind: "anonymous" };
  }
  const password = passwords.get(key);
  if (password === undefined) {
    throw new ConfigurationError(
      startedByCore
        ? `Module ${key} logs in as ${transport.auth.userName} but the core gave no password. Start the bridge again from the viewer and type it.`
        : `Module ${key} logs in as ${transport.auth.userName}: a password cannot be given on a terminal run. Start it from the viewer.`,
    );
  }
  return { kind: "user", userName: transport.auth.userName, password };
}

// Second line of defence, after the core's own check (ADR 0065 point 8): a password must not
// cross the network with security None. Toward this machine it never leaves the host.
function requirePasswordProtected(
  key: string,
  transport: OpcuaClientTransport,
  target: string,
  endpoint: string,
): void {
  if (
    transport.auth.kind === "user" &&
    transport.securityMode === "None" &&
    classifyAddress(target) !== "loopback"
  ) {
    throw new ConfigurationError(
      `Module ${key} sends a user name and password to ${endpoint} with security None: they would travel in clear. Choose Sign or SignAndEncrypt for this module in the I/O view.`,
    );
  }
}

function signalsOf(module: IoMappingResponse["modules"][number]): NodeSignal[] {
  return module.channels.map((channel) => {
    const opcua = channel.opcua;
    if (opcua === undefined || channel.direction === null) {
      throw new ProtocolError(
        `Channel ${channel.tag} of module ${module.key} has no resolved OPC UA node: the core and the bridge disagree on the protocol.`,
      );
    }
    return {
      tag: channel.tag,
      direction: channel.direction,
      identifier: opcua.resolvedIdentifier,
      iecType: opcua.iecType,
    };
  });
}

function requireTargetsFor(keys: readonly string[], targets: ReadonlyMap<string, string>): void {
  const missing = keys.filter((key) => !targets.has(key));
  if (missing.length > 0) {
    throw new ConfigurationError(`No --target for module ${missing.join(", ")}.`);
  }
  const unknown = [...targets.keys()].filter((key) => !keys.includes(key));
  if (unknown.length > 0) {
    throw new ConfigurationError(
      `--target names ${unknown.join(", ")}, which is not an OPC UA module of this Pantin.`,
    );
  }
}

export function planModules(options: {
  projection: IoMappingResponse;
  targets: ReadonlyMap<string, string>;
  passwords: ReadonlyMap<string, string>;
  startedByCore: boolean;
}): BridgePlan {
  const mappingId = requireValidMapping(options.projection);
  const opcuaModules = options.projection.modules.flatMap((module) =>
    module.transport.kind === OPCUA_CLIENT_KIND ? [{ module, transport: module.transport }] : [],
  );
  if (opcuaModules.length === 0) {
    throw new ConfigurationError("This Pantin has no OPC UA module: there is nothing to bridge.");
  }
  requireTargetsFor(
    opcuaModules.map(({ module }) => module.key),
    options.targets,
  );
  const modules = opcuaModules.map(({ module, transport }) => {
    const target = options.targets.get(module.key) ?? "";
    const endpoint = endpointOf(transport, target);
    requirePasswordProtected(module.key, transport, target, endpoint);
    return {
      key: module.key,
      transport,
      target,
      endpoint,
      login: loginOf(module.key, transport, options.passwords, options.startedByCore),
      signals: signalsOf(module),
    };
  });
  return { mappingId, modules };
}
