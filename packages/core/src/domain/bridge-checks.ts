import {
  type BridgeNetwork,
  type IoMappingResponse,
  type IoStatus,
  MODBUS_TCP_SLAVE_KIND,
} from "@pantin/protocol";
import {
  type AddressClass,
  type Cidr,
  cidrContains,
  classifyIpAddress,
  formatIpAddress,
  parseCidr,
  parseIpAddress,
} from "./network-address.ts";

// The checks made before the core spawns a bridge (ADR 0050 point 4). Pure:
// the host's interfaces, the mapping and the other bridges come in as data.
// The bridge repeats the address checks as a second line (ADR 0046).

export const MAX_SUPERVISED_BRIDGES = 4;
const LOOPBACK_LISTEN = "127.0.0.1";

// 400 for a request that can never work, 409 for one that conflicts with the
// current state of the core.
type BridgeRefusal = {
  code: "invalid_request" | "conflict";
  message: string;
};

export type BridgeCheckResult =
  | { ok: true; network: BridgeNetwork }
  | { ok: false; refusal: BridgeRefusal };

export type SupervisedBridgeClaim = {
  pantinId: string;
  listen: string;
  ports: readonly number[];
};

export type BridgeStartFacts = {
  // Every address of the host's interfaces, as `os.networkInterfaces()` gives them.
  hostAddresses: readonly string[];
  mapping: {
    status: IoStatus;
    // The Modbus TCP slave modules only: this bridge serves no other transport (ADR 0064 point 8).
    modules: readonly { key: string; port: number }[];
    // The first problems, already worded.
    problems: readonly string[];
  };
  // True when a bridge holds the `plc` slot and Pantin did not start it.
  externalBridgeConnected: boolean;
  // Where the core itself listens.
  core: { host: string; port: number };
  // The bridges that are starting, running or stopping, this Pantin's included.
  activeBridges: readonly SupervisedBridgeClaim[];
};

const LISTEN_ADVICE = "Use 127.0.0.1 (local) or one private address of this machine.";

const LISTEN_REFUSALS: Partial<Record<AddressClass, string>> = {
  wildcard: "it listens on every interface",
  public: "it is not a private address (RFC 1918 or fc00::/7)",
  "link-local": "link-local addresses are refused",
  invalid: "it is not one literal IP address (hostnames are refused)",
};

// What the viewer offers: 127.0.0.1 first, then the host's private addresses.
export function listenChoicesOf(hostAddresses: readonly string[]): string[] {
  const privateAddresses = hostAddresses.flatMap((text) => {
    const address = parseIpAddress(text);
    return address !== undefined && classifyIpAddress(address) === "private"
      ? [formatIpAddress(address)]
      : [];
  });
  return [...new Set([LOOPBACK_LISTEN, ...privateAddresses])];
}

function refuse(code: BridgeRefusal["code"], message: string): BridgeCheckResult {
  return { ok: false, refusal: { code, message } };
}

function checkListen(listen: string, hostAddresses: readonly string[]): BridgeRefusal | string {
  const address = parseIpAddress(listen);
  const addressClass = address === undefined ? "invalid" : classifyIpAddress(address);
  const reason = LISTEN_REFUSALS[addressClass];
  if (address === undefined || reason !== undefined) {
    return {
      code: "invalid_request",
      message: `Refusing "${listen}": ${reason}. ${LISTEN_ADVICE}`,
    };
  }
  const normalized = formatIpAddress(address);
  const choices = listenChoicesOf(hostAddresses);
  if (!choices.includes(normalized)) {
    return {
      code: "invalid_request",
      message: `"${listen}" is not an address of this machine. Choose one of: ${choices.join(", ")}.`,
    };
  }
  return normalized;
}

const ALLOWED_RANGES: readonly Cidr[] = [
  "127.0.0.0/8",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "fc00::/7",
  "::1/128",
].flatMap((text) => parseCidr(text) ?? []);

// An entry reaching outside the loopback and private ranges could never match
// a source, since the bridge closes those at accept (ADR 0004 point 4).
function isInsidePrivateRanges(entry: Cidr): boolean {
  return ALLOWED_RANGES.some(
    (range) => entry.prefixLength >= range.prefixLength && cidrContains(range, entry.network),
  );
}

function checkAllow(allow: readonly string[]): BridgeRefusal | undefined {
  if (allow.length === 0) {
    return {
      code: "invalid_request",
      message: "A private-network listen address needs at least one allowed IP or CIDR.",
    };
  }
  for (const text of allow) {
    const cidr = parseCidr(text);
    if (cidr === undefined) {
      return {
        code: "invalid_request",
        message: `Invalid allow entry "${text}": use an IP address or a CIDR such as 192.168.1.0/24.`,
      };
    }
    if (!isInsidePrivateRanges(cidr)) {
      return {
        code: "invalid_request",
        message: `Allow entry "${text}" is outside the loopback and private ranges, so no source could match it.`,
      };
    }
  }
  return undefined;
}

function checkMapping(mapping: BridgeStartFacts["mapping"]): BridgeRefusal | undefined {
  if (mapping.status === "valid") {
    return mapping.modules.length > 0
      ? undefined
      : {
          code: "conflict",
          message:
            "io.json has no Modbus TCP slave module, and this bridge serves only those. Add one in the I/O view before starting the bridge.",
        };
  }
  const detail =
    mapping.status === "missing"
      ? "This Pantin has no io.json yet."
      : `The I/O mapping is invalid: ${mapping.problems.join("; ")}.`;
  return { code: "conflict", message: `${detail} Fix it before starting the bridge.` };
}

function checkSlot(pantinId: string, facts: BridgeStartFacts): BridgeRefusal | undefined {
  if (facts.activeBridges.some((claim) => claim.pantinId === pantinId)) {
    return { code: "conflict", message: "This Pantin's bridge is already running or starting." };
  }
  return facts.externalBridgeConnected
    ? {
        code: "conflict",
        message: "A bridge started outside Pantin is connected to this Pantin: stop it first.",
      }
    : undefined;
}

function checkPorts(listen: string, facts: BridgeStartFacts): BridgeRefusal | undefined {
  for (const { key, port } of facts.mapping.modules) {
    if (listen === facts.core.host && port === facts.core.port) {
      return {
        code: "conflict",
        message: `Module ${key} uses ${listen}:${port}, where the core itself listens. Change the module's port in io.json.`,
      };
    }
    const holder = facts.activeBridges.find(
      (claim) => claim.listen === listen && claim.ports.includes(port),
    );
    if (holder !== undefined) {
      return {
        code: "conflict",
        message: `Module ${key} uses ${listen}:${port}, already held by the bridge of Pantin ${holder.pantinId}. Change the module's port in io.json.`,
      };
    }
  }
  return undefined;
}

// This bridge is the Modbus one: the other modules belong to other bridges (ADR 0064 point 8).
export function modbusModulesOf(modules: IoMappingResponse["modules"]) {
  return modules.flatMap((module) =>
    module.transport.kind === MODBUS_TCP_SLAVE_KIND
      ? [{ key: module.key, port: module.transport.port }]
      : [],
  );
}

export function checkBridgeStart(
  pantinId: string,
  request: { listen: string; allow: readonly string[] },
  facts: BridgeStartFacts,
): BridgeCheckResult {
  const listen = checkListen(request.listen, facts.hostAddresses);
  if (typeof listen !== "string") {
    return { ok: false, refusal: listen };
  }
  const isLoopback = listen === LOOPBACK_LISTEN;
  const allowRefusal = isLoopback ? undefined : checkAllow(request.allow);
  const refusal =
    allowRefusal ??
    checkMapping(facts.mapping) ??
    checkSlot(pantinId, facts) ??
    checkPorts(listen, facts) ??
    checkCap(facts.activeBridges.length);
  if (refusal !== undefined) {
    return refuse(refusal.code, refusal.message);
  }
  return { ok: true, network: { listen, allow: isLoopback ? [] : [...request.allow] } };
}

function checkCap(activeCount: number): BridgeRefusal | undefined {
  return activeCount >= MAX_SUPERVISED_BRIDGES
    ? {
        code: "conflict",
        message: `The core already supervises ${MAX_SUPERVISED_BRIDGES} bridges. Stop one first.`,
      }
    : undefined;
}
