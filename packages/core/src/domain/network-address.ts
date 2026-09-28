// IP address parsing and classification for ADR 0004 and ADR 0008. Pure: no
// DNS, no system calls. A hostname is never an address here.

export type IpAddress = { family: 4 | 6; bytes: readonly number[] };

export type AddressClass =
  | "loopback"
  | "private"
  | "wildcard"
  | "link-local"
  | "public"
  | "invalid";

export type Cidr = { network: IpAddress; prefixLength: number };

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_GROUP_PATTERN = /^[0-9a-f]{1,4}$/i;

function parseIpv4(text: string): number[] | undefined {
  const match = IPV4_PATTERN.exec(text);
  if (match === null) {
    return undefined;
  }
  const octetTexts = match.slice(1);
  // Leading zeros are refused: some tools read them as octal.
  if (octetTexts.some((octet) => octet.length > 1 && octet.startsWith("0"))) {
    return undefined;
  }
  const octets = octetTexts.map(Number);
  return octets.every((octet) => octet <= 255) ? octets : undefined;
}

function parseIpv6Groups(groupsText: string): number[] | undefined {
  if (groupsText === "") {
    return [];
  }
  const groups = groupsText.split(":");
  if (!groups.every((group) => IPV6_GROUP_PATTERN.test(group))) {
    return undefined;
  }
  return groups.map((group) => Number.parseInt(group, 16));
}

// Rewrites a trailing dotted IPv4 ("::ffff:10.0.0.1") as two hex groups.
function expandEmbeddedIpv4(text: string): string | undefined {
  const lastColon = text.lastIndexOf(":");
  const lastPart = text.slice(lastColon + 1);
  if (!lastPart.includes(".")) {
    return text;
  }
  const octets = parseIpv4(lastPart);
  if (octets === undefined) {
    return undefined;
  }
  const [a = 0, b = 0, c = 0, d = 0] = octets;
  const high = (a * 256 + b).toString(16);
  const low = (c * 256 + d).toString(16);
  return `${text.slice(0, lastColon + 1)}${high}:${low}`;
}

function parseIpv6(text: string): number[] | undefined {
  // Zone ids ("fe80::1%eth0") are not a single portable address.
  const expanded = text.includes("%") ? undefined : expandEmbeddedIpv4(text);
  if (expanded === undefined) {
    return undefined;
  }
  const halves = expanded.split("::");
  if (halves.length > 2) {
    return undefined;
  }
  const left = parseIpv6Groups(halves[0] ?? "");
  const right = halves.length === 2 ? parseIpv6Groups(halves[1] ?? "") : [];
  if (left === undefined || right === undefined) {
    return undefined;
  }
  const missingGroups = 8 - left.length - right.length;
  const isValidLength = halves.length === 2 ? missingGroups >= 1 : missingGroups === 0;
  if (!isValidLength) {
    return undefined;
  }
  const groups = [...left, ...new Array<number>(missingGroups).fill(0), ...right];
  return groups.flatMap((group) => [group >> 8, group & 0xff]);
}

function isIpv4Mapped(bytes: readonly number[]): boolean {
  return bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
}

// Parses a literal IPv4 or IPv6 address; IPv4-mapped IPv6 becomes IPv4.
export function parseIpAddress(text: string): IpAddress | undefined {
  const ipv4 = parseIpv4(text);
  if (ipv4 !== undefined) {
    return { family: 4, bytes: ipv4 };
  }
  const ipv6 = text.includes(":") ? parseIpv6(text) : undefined;
  if (ipv6 === undefined) {
    return undefined;
  }
  return isIpv4Mapped(ipv6) ? { family: 4, bytes: ipv6.slice(12) } : { family: 6, bytes: ipv6 };
}

export function formatIpAddress(address: IpAddress): string {
  if (address.family === 4) {
    return address.bytes.join(".");
  }
  const groups: string[] = [];
  for (let index = 0; index < 16; index += 2) {
    groups.push(
      (((address.bytes[index] ?? 0) << 8) | (address.bytes[index + 1] ?? 0)).toString(16),
    );
  }
  return groups.join(":");
}

export function sameIpAddress(first: IpAddress, second: IpAddress): boolean {
  return (
    first.family === second.family &&
    first.bytes.every((byte, index) => byte === second.bytes[index])
  );
}

function classifyIpv4([a = 0, b = 0, c = 0, d = 0]: readonly number[]): AddressClass {
  if (a === 0 && b === 0 && c === 0 && d === 0) {
    return "wildcard";
  }
  if (a === 127) {
    return "loopback";
  }
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
    return "private";
  }
  // Everything else, shared address space 100.64.0.0/10 included, is refused
  // as "public" until a measurement justifies more (ADR 0004 open points).
  return a === 169 && b === 254 ? "link-local" : "public";
}

function classifyIpv6(bytes: readonly number[]): AddressClass {
  if (bytes.every((byte) => byte === 0)) {
    return "wildcard";
  }
  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) {
    return "loopback";
  }
  const [first = 0, second = 0] = bytes;
  if ((first & 0xfe) === 0xfc) {
    return "private";
  }
  return first === 0xfe && (second & 0xc0) === 0x80 ? "link-local" : "public";
}

export function classifyIpAddress(address: IpAddress): AddressClass {
  return address.family === 4 ? classifyIpv4(address.bytes) : classifyIpv6(address.bytes);
}

export function classifyAddress(text: string): AddressClass {
  const address = parseIpAddress(text);
  return address === undefined ? "invalid" : classifyIpAddress(address);
}

// "10.0.0.0/8", "fd00::/8" or a single address (full length prefix).
export function parseCidr(text: string): Cidr | undefined {
  const [addressText = "", prefixText, ...rest] = text.split("/");
  const address = parseIpAddress(addressText);
  if (address === undefined || rest.length > 0) {
    return undefined;
  }
  const maximum = address.family === 4 ? 32 : 128;
  // A mapped IPv6 CIDR was converted to IPv4: its prefix loses the 96 mapping bits.
  const mappedOffset = address.family === 4 && addressText.includes(":") ? 96 : 0;
  if (prefixText === undefined) {
    return { network: address, prefixLength: maximum };
  }
  const prefixLength = /^\d{1,3}$/.test(prefixText) ? Number(prefixText) - mappedOffset : -1;
  return prefixLength >= 0 && prefixLength <= maximum
    ? { network: address, prefixLength }
    : undefined;
}

export function cidrContains(cidr: Cidr, address: IpAddress): boolean {
  if (cidr.network.family !== address.family) {
    return false;
  }
  for (let bit = 0; bit < cidr.prefixLength; bit += 1) {
    const byteIndex = Math.floor(bit / 8);
    const mask = 0x80 >> (bit % 8);
    if (
      ((cidr.network.bytes[byteIndex] ?? 0) & mask) !==
      ((address.bytes[byteIndex] ?? 0) & mask)
    ) {
      return false;
    }
  }
  return true;
}
