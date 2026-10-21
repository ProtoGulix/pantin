import {
  classifyIpAddress,
  formatIpAddress,
  type IpAddress,
  parseIpAddress,
} from "./network-address.ts";

// Classification of the address Pantin connects out to (ADR 0065 point 8). Pure: a host
// name is refused, never resolved, because DNS can rebind to anything.

export type NetworkScope = "local" | "lan";

export type OutgoingTargetRefusalReason =
  | "host_name"
  | "invalid_address"
  | "wildcard"
  | "multicast"
  | "broadcast"
  | "link_local"
  | "shared_address_space"
  | "loopback_not_allowed"
  | "loopback_other_than_standard"
  | "private_not_allowed_in_local"
  | "public";

export type OutgoingTargetClassification =
  | { accepted: true; address: string }
  | { accepted: false; reason: OutgoingTargetRefusalReason; message: string };

const REFUSAL_MESSAGES: Readonly<Record<OutgoingTargetRefusalReason, string>> = {
  host_name:
    "A host name is not accepted as a target, because DNS can point it anywhere. Give the PLC's IP address, for example 192.168.1.10.",
  invalid_address:
    "This is not an IP address. Give a plain IPv4 or IPv6 address, without brackets, port or zone.",
  wildcard: "0.0.0.0 and :: mean every interface, not a PLC. Give the address of the PLC.",
  multicast: "A multicast address reaches a group of machines. Give the address of one PLC.",
  broadcast: "A broadcast address reaches every machine. Give the address of one PLC.",
  link_local:
    "A link-local address (169.254.x.x, fe80::/10) is not reachable reliably. Give a private address of the PLC.",
  shared_address_space:
    "The shared address space 100.64.0.0/10 is used by carriers, not by a private network. Give a private address (10.x, 172.16 to 172.31, 192.168.x).",
  loopback_not_allowed:
    "A loopback address means this machine. For a PLC on another machine give its private address; for one on this machine choose the local scope.",
  loopback_other_than_standard:
    "In the local scope only 127.0.0.1 or ::1 is accepted, not another loopback address.",
  private_not_allowed_in_local:
    "The local scope reaches a PLC on this machine only (127.0.0.1 or ::1). Choose the lan scope for a private address.",
  public:
    "A public address is never accepted: Pantin connects only to a PLC on this machine or on the private network.",
};

function refuse(reason: OutgoingTargetRefusalReason): OutgoingTargetClassification {
  return { accepted: false, reason, message: REFUSAL_MESSAGES[reason] };
}

// A host name is made of letters, digits, dots, dashes and underscores with at least one
// letter; any other text that is not a literal address is a malformed address.
function refusalForUnparsedText(text: string): OutgoingTargetClassification {
  const looksLikeHostName = /^[a-z0-9_.-]+$/i.test(text) && /[a-z_-]/i.test(text);
  return refuse(looksLikeHostName ? "host_name" : "invalid_address");
}

function isIpv4InRange(
  address: IpAddress,
  first: number,
  predicate: (second: number) => boolean,
): boolean {
  const [a = 0, b = 0] = address.bytes;
  return address.family === 4 && a === first && predicate(b);
}

function isBroadcast(address: IpAddress): boolean {
  return address.family === 4 && address.bytes.every((byte) => byte === 255);
}

function isMulticast(address: IpAddress): boolean {
  const first = address.bytes[0] ?? 0;
  return address.family === 4 ? first >= 224 && first <= 239 : first === 0xff;
}

function isSharedAddressSpace(address: IpAddress): boolean {
  return isIpv4InRange(address, 100, (second) => second >= 64 && second <= 127);
}

function isStandardLoopback(address: IpAddress): boolean {
  return formatIpAddress(address) === "127.0.0.1" || formatIpAddress(address) === "0:0:0:0:0:0:0:1";
}

// The refusal that applies whatever the scope, or undefined.
function commonRefusal(address: IpAddress): OutgoingTargetRefusalReason | undefined {
  const addressClass = classifyIpAddress(address);
  if (addressClass === "wildcard") {
    return "wildcard";
  }
  // Multicast and broadcast come before the generic "public" the shared classifier gives.
  if (isBroadcast(address)) {
    return "broadcast";
  }
  if (isMulticast(address)) {
    return "multicast";
  }
  if (addressClass === "link-local") {
    return "link_local";
  }
  return isSharedAddressSpace(address) ? "shared_address_space" : undefined;
}

function scopeRefusal(
  address: IpAddress,
  scope: NetworkScope,
): OutgoingTargetRefusalReason | undefined {
  const addressClass = classifyIpAddress(address);
  if (scope === "local") {
    if (addressClass === "private") {
      return "private_not_allowed_in_local";
    }
    if (addressClass === "loopback") {
      return isStandardLoopback(address) ? undefined : "loopback_other_than_standard";
    }
    return "public";
  }
  if (addressClass === "loopback") {
    return "loopback_not_allowed";
  }
  return addressClass === "private" ? undefined : "public";
}

// Returns the normalised address (IPv4-mapped forms become IPv4) or the reason it is refused.
export function classifyOutgoingTarget(
  text: string,
  scope: NetworkScope,
): OutgoingTargetClassification {
  const address = parseIpAddress(text);
  if (address === undefined) {
    return refusalForUnparsedText(text);
  }
  const reason = commonRefusal(address) ?? scopeRefusal(address, scope);
  return reason === undefined
    ? { accepted: true, address: formatIpAddress(address) }
    : refuse(reason);
}
