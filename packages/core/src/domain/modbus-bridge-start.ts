import {
  type AddressClass,
  type Cidr,
  cidrContains,
  classifyIpAddress,
  formatIpAddress,
  parseCidr,
  parseIpAddress,
} from "@pantin/network-address";
import type { ModbusBridgeNetwork } from "@pantin/protocol";
import {
  type BridgeRefusal,
  type BridgeStartFacts,
  checkCap,
  checkMapping,
  checkSlot,
  refusal,
} from "./bridge-checks.ts";

// The start checks of the Modbus TCP slave bridge, which listens (ADR 0050 point 4): the
// listen address, the allow list and the ports. The bridge repeats the address checks as
// a second line (ADR 0046).

const LOOPBACK_LISTEN = "127.0.0.1";

export type ModbusStartResult =
  | { ok: true; network: ModbusBridgeNetwork }
  | { ok: false; refusal: BridgeRefusal };

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

function checkListen(listen: string, hostAddresses: readonly string[]): BridgeRefusal | string {
  const address = parseIpAddress(listen);
  const addressClass = address === undefined ? "invalid" : classifyIpAddress(address);
  const reason = LISTEN_REFUSALS[addressClass];
  if (address === undefined || reason !== undefined) {
    return refusal("invalid_request", `Refusing "${listen}": ${reason}. ${LISTEN_ADVICE}`);
  }
  const normalized = formatIpAddress(address);
  const choices = listenChoicesOf(hostAddresses);
  if (!choices.includes(normalized)) {
    return refusal(
      "invalid_request",
      `"${listen}" is not an address of this machine. Choose one of: ${choices.join(", ")}.`,
    );
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
    return refusal(
      "invalid_request",
      "A private-network listen address needs at least one allowed IP or CIDR.",
    );
  }
  for (const text of allow) {
    const cidr = parseCidr(text);
    if (cidr === undefined) {
      return refusal(
        "invalid_request",
        `Invalid allow entry "${text}": use an IP address or a CIDR such as 192.168.1.0/24.`,
      );
    }
    if (!isInsidePrivateRanges(cidr)) {
      return refusal(
        "invalid_request",
        `Allow entry "${text}" is outside the loopback and private ranges, so no source could match it.`,
      );
    }
  }
  return undefined;
}

function checkPorts(listen: string, facts: BridgeStartFacts): BridgeRefusal | undefined {
  for (const { key, port } of facts.mapping.modules) {
    if (port === null) {
      continue;
    }
    if (listen === facts.core.host && port === facts.core.port) {
      return refusal(
        "conflict",
        `Module ${key} uses ${listen}:${port}, where the core itself listens. Change the module's port in io.json.`,
      );
    }
    const holder = facts.activeBridges.find(
      (claim) => claim.listen === listen && claim.ports.includes(port),
    );
    if (holder !== undefined) {
      return refusal(
        "conflict",
        `Module ${key} uses ${listen}:${port}, already held by the bridge of Pantin ${holder.pantinId}. Change the module's port in io.json.`,
      );
    }
  }
  return undefined;
}

export function checkModbusStart(
  pantinId: string,
  request: { listen: string; allow: readonly string[] },
  facts: BridgeStartFacts,
): ModbusStartResult {
  const listen = checkListen(request.listen, facts.hostAddresses);
  if (typeof listen !== "string") {
    return { ok: false, refusal: listen };
  }
  const isLoopback = listen === LOOPBACK_LISTEN;
  const refused =
    (isLoopback ? undefined : checkAllow(request.allow)) ??
    checkMapping(facts) ??
    checkSlot(pantinId, facts) ??
    checkPorts(listen, facts) ??
    checkCap(facts.activeBridges.length);
  if (refused !== undefined) {
    return { ok: false, refusal: refused };
  }
  return { ok: true, network: { listen, allow: isLoopback ? [] : [...request.allow] } };
}

// The kind's part of the command line, after the arguments every bridge takes.
export function modbusArguments(network: ModbusBridgeNetwork): string[] {
  return ["--listen", network.listen, ...network.allow.flatMap((entry) => ["--allow", entry])];
}
