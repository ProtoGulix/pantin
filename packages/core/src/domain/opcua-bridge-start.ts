import {
  classifyIpAddress,
  classifyOutgoingTarget,
  type NetworkScope,
  parseIpAddress,
} from "@pantin/network-address";
import {
  OPCUA_CLIENT_KIND,
  type OpcuaBridgeNetwork,
  type OpcuaClientTransport,
} from "@pantin/protocol";
import {
  type BridgeRefusal,
  type BridgeStartFacts,
  checkCap,
  checkMapping,
  checkSlot,
  refusal,
} from "./bridge-checks.ts";
import { hostAndPort } from "./bridge-output.ts";

// The start checks of the OPC UA client bridge, which connects out (ADR 0065 points 8 and
// 9): one target per module, the security it is allowed, the passwords it needs and what the
// Cloudflare exposure may ask. The bridge repeats the address checks as a second line.

export type OpcuaStartRequest = {
  // Module key to the PLC's IP address, as typed by the user.
  targets: Readonly<Record<string, string>>;
  passwords: Readonly<Record<string, string>>;
  trust: readonly string[];
  // True when the request came through the Cloudflare exposure (X-Pantin-Exposure).
  viaExposure: boolean;
};

export type OpcuaStartPlan = {
  network: OpcuaBridgeNetwork;
  // The password of every `user` module: the request's, else the one the core holds.
  passwords: Record<string, string>;
  trust: string[];
  // Modules that reach a private-network PLC without security: a console warning each.
  unsecuredLanModules: string[];
};

export type OpcuaStartResult =
  | { ok: true; plan: OpcuaStartPlan }
  | { ok: false; refusal: BridgeRefusal };

export const EXPOSURE_REFUSAL_MESSAGE =
  "Through the remote exposure Pantin connects only to a PLC on this host (127.0.0.1 or ::1), without passwords or certificate trust. Open the viewer on the host for these.";

type OpcuaModule = { key: string; transport: OpcuaClientTransport };
// A step that either gives its value or the refusal that ends the check.
type Checked<Value> = { ok: true; value: Value } | { ok: false; refusal: BridgeRefusal };

function refused(
  code: BridgeRefusal["code"],
  message: string,
): { ok: false; refusal: BridgeRefusal } {
  return { ok: false, refusal: refusal(code, message) };
}

// The scope follows the address, since the user gives one target and no scope: a loopback
// address is `local` (so only 127.0.0.1 and ::1 pass), anything else, a host name included,
// is judged as `lan` (so only a private address passes).
function scopeOf(target: string): NetworkScope {
  const address = parseIpAddress(target);
  return address !== undefined && classifyIpAddress(address) === "loopback" ? "local" : "lan";
}

/** `opc.tcp://<address>:<port><path>`, an IPv6 address in brackets. */
export function opcuaEndpointOf(address: string, transport: OpcuaClientTransport): string {
  return `opc.tcp://${hostAndPort(address, transport.port)}${transport.endpointPath}`;
}

function opcuaModulesOf(facts: BridgeStartFacts): OpcuaModule[] {
  return facts.moduleTransports.flatMap(({ key, transport }) =>
    transport.kind === OPCUA_CLIENT_KIND ? [{ key, transport }] : [],
  );
}

// Checked before anything else, so that the exposure learns nothing about the mapping. Only
// 127.0.0.1 and ::1 pass: any other target, a malformed one included, is refused as one that
// is not on this host.
function checkExposure(request: OpcuaStartRequest): BridgeRefusal | undefined {
  if (!request.viaExposure) {
    return undefined;
  }
  const asksMore =
    Object.keys(request.passwords).length > 0 ||
    request.trust.length > 0 ||
    Object.values(request.targets).some(
      (target) => !classifyOutgoingTarget(target, "local").accepted,
    );
  return asksMore
    ? { code: "invalid_request", message: EXPOSURE_REFUSAL_MESSAGE, httpStatus: 403 }
    : undefined;
}

function checkTargetKeys(
  targets: ReadonlyMap<string, string>,
  modules: readonly OpcuaModule[],
): BridgeRefusal | undefined {
  const keys = modules.map(({ key }) => key);
  const unknown = [...targets.keys()].find((key) => !keys.includes(key));
  if (unknown !== undefined) {
    return refusal(
      "invalid_request",
      `Target "${unknown}" is not an OPC UA module of this Pantin. Its modules are: ${keys.join(", ")}.`,
    );
  }
  const missing = keys.find((key) => !targets.has(key));
  return missing === undefined
    ? undefined
    : refusal(
        "invalid_request",
        `Module "${missing}" has no target. Give the PLC's address of every OPC UA module.`,
      );
}

function classifyTargets(
  targets: ReadonlyMap<string, string>,
  modules: readonly OpcuaModule[],
): Checked<Map<string, string>> {
  const addresses = new Map<string, string>();
  for (const { key } of modules) {
    const target = targets.get(key) ?? "";
    const result = classifyOutgoingTarget(target, scopeOf(target));
    if (!result.accepted) {
      return refused(
        "invalid_request",
        `Target of module "${key}" ("${target}"): ${result.message}`,
      );
    }
    addresses.set(key, result.address);
  }
  return { ok: true, value: addresses };
}

function isLoopbackAddress(address: string): boolean {
  return scopeOf(address) === "local";
}

// A password would travel in clear to a private-network PLC: refused. Toward this machine
// it never leaves the host. `None` without a user is only warned about.
function checkSecurity(
  modules: readonly OpcuaModule[],
  addresses: ReadonlyMap<string, string>,
): Checked<string[]> {
  const unsecuredLanModules: string[] = [];
  for (const { key, transport } of modules) {
    const address = addresses.get(key) ?? "";
    if (transport.securityMode !== "None" || isLoopbackAddress(address)) {
      continue;
    }
    if (transport.auth.kind === "user") {
      return refused(
        "invalid_request",
        `Module "${key}" sends a user name and password to ${opcuaEndpointOf(address, transport)} with security None: they would travel in clear. Choose Sign or SignAndEncrypt for this module in the I/O view.`,
      );
    }
    unsecuredLanModules.push(key);
  }
  return { ok: true, value: unsecuredLanModules };
}

function checkPasswordKeys(
  given: ReadonlyMap<string, string>,
  modules: readonly OpcuaModule[],
): BridgeRefusal | undefined {
  for (const key of given.keys()) {
    const module = modules.find((candidate) => candidate.key === key);
    if (module === undefined) {
      return refusal(
        "invalid_request",
        `A password was given for "${key}", which is not an OPC UA module of this Pantin.`,
      );
    }
    if (module.transport.auth.kind !== "user") {
      return refusal("invalid_request", `Module "${key}" is anonymous: it takes no password.`);
    }
  }
  return undefined;
}

function resolvePasswords(
  request: OpcuaStartRequest,
  stored: Readonly<Record<string, string>>,
  modules: readonly OpcuaModule[],
): Checked<Record<string, string>> {
  const given = new Map(Object.entries(request.passwords));
  const storedByKey = new Map(Object.entries(stored));
  const keysRefused = checkPasswordKeys(given, modules);
  if (keysRefused !== undefined) {
    return { ok: false, refusal: keysRefused };
  }
  const passwords: Record<string, string> = {};
  for (const { key, transport } of modules) {
    if (transport.auth.kind !== "user") {
      continue;
    }
    const password = given.get(key) ?? storedByKey.get(key);
    if (password === undefined) {
      return refused(
        "invalid_request",
        `Module "${key}" logs in with a user name and needs a password. Enter it before starting.`,
      );
    }
    passwords[key] = password;
  }
  return { ok: true, value: passwords };
}

// Everything that depends on the request and the module settings, after the cheap checks.
function planOf(
  request: OpcuaStartRequest,
  facts: BridgeStartFacts,
  modules: readonly OpcuaModule[],
): Checked<OpcuaStartPlan> {
  const addresses = classifyTargets(new Map(Object.entries(request.targets)), modules);
  if (!addresses.ok) {
    return addresses;
  }
  const unsecured = checkSecurity(modules, addresses.value);
  if (!unsecured.ok) {
    return unsecured;
  }
  const passwords = resolvePasswords(request, facts.storedPasswords, modules);
  if (!passwords.ok) {
    return passwords;
  }
  const plan: OpcuaStartPlan = {
    network: { targets: Object.fromEntries(addresses.value) },
    passwords: passwords.value,
    trust: request.trust.map((hash) => hash.toLowerCase()),
    unsecuredLanModules: unsecured.value,
  };
  return { ok: true, value: plan };
}

export function checkOpcuaStart(
  pantinId: string,
  request: OpcuaStartRequest,
  facts: BridgeStartFacts,
): OpcuaStartResult {
  const modules = opcuaModulesOf(facts);
  const targets = new Map(Object.entries(request.targets));
  const refusedEarly =
    checkExposure(request) ?? checkMapping(facts) ?? checkTargetKeys(targets, modules);
  if (refusedEarly !== undefined) {
    return { ok: false, refusal: refusedEarly };
  }
  const planned = planOf(request, facts, modules);
  if (!planned.ok) {
    return planned;
  }
  const refusedLate = checkSlot(pantinId, facts) ?? checkCap(facts.activeBridges.length);
  return refusedLate === undefined
    ? { ok: true, plan: planned.value }
    : { ok: false, refusal: refusedLate };
}

// The kind's part of the command line. No password: the command line shows in `ps`.
export function opcuaArguments(plan: OpcuaStartPlan): string[] {
  return [
    ...Object.entries(plan.network.targets).flatMap(([key, address]) => [
      "--target",
      `${key}=${address}`,
    ]),
    ...plan.trust.flatMap((hash) => ["--trust", hash]),
  ];
}
