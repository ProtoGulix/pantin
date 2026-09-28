import {
  type AddressClass,
  type Cidr,
  cidrContains,
  classifyIpAddress,
  formatIpAddress,
  type IpAddress,
  parseCidr,
  parseIpAddress,
  sameIpAddress,
} from "./network-address.ts";

// Startup network configuration (ADR 0004, ADR 0008): which address to
// listen on, which connection sources to accept, which Host headers to trust.

const DEFAULT_LISTEN_ADDRESS = "127.0.0.1";

type NetworkMode = "local" | "lan";

export type NetworkConfig = {
  mode: NetworkMode;
  // Text given to listen(): IPv4 dotted form when the input was IPv4-mapped.
  listenAddress: string;
  listenIp: IpAddress;
  // Empty means every private or loopback source; never widens beyond that.
  allowlist: readonly Cidr[];
};

export type NetworkConfigResult =
  | { ok: true; config: NetworkConfig }
  | { ok: false; message: string };

const REFUSAL_REASONS: Partial<Record<AddressClass, string>> = {
  wildcard: "it listens on every interface",
  public: "it is not a private address (RFC 1918 or fc00::/7)",
  "link-local": "link-local addresses are refused (ADR 0004 open points)",
  invalid: "it is not one literal IP address (hostnames are refused)",
};

const LISTEN_ADVICE =
  "Use 127.0.0.1 (local, default) or one private address of this machine, e.g. 192.168.1.20.";

function resolveAllowlist(allow: readonly string[]): Cidr[] | string {
  const allowlist: Cidr[] = [];
  for (const entry of allow) {
    const cidr = parseCidr(entry);
    if (cidr === undefined) {
      return `Invalid --allow "${entry}": use an IP address or a CIDR such as 192.168.1.0/24.`;
    }
    allowlist.push(cidr);
  }
  return allowlist;
}

export function resolveNetworkConfig(
  listen: string = DEFAULT_LISTEN_ADDRESS,
  allow: readonly string[] = [],
): NetworkConfigResult {
  const listenIp = parseIpAddress(listen);
  const addressClass = listenIp === undefined ? "invalid" : classifyIpAddress(listenIp);
  const refusal = REFUSAL_REASONS[addressClass];
  if (listenIp === undefined || refusal !== undefined) {
    return {
      ok: false,
      message: `Refusing to listen on "${listen}": ${refusal}. ${LISTEN_ADVICE}`,
    };
  }
  const allowlist = resolveAllowlist(allow);
  if (typeof allowlist === "string") {
    return { ok: false, message: allowlist };
  }
  const listenAddress = listenIp.family === 4 ? formatIpAddress(listenIp) : listen;
  const mode: NetworkMode = addressClass === "loopback" ? "local" : "lan";
  return { ok: true, config: { mode, listenAddress, listenIp, allowlist } };
}

// Checked on accept, before any byte is read. `remoteAddress` is what Node
// reports for the socket (undefined once the socket is already gone).
export function isSourceAccepted(
  config: NetworkConfig,
  remoteAddress: string | undefined,
): boolean {
  const source = remoteAddress === undefined ? undefined : parseIpAddress(remoteAddress);
  if (source === undefined) {
    return false;
  }
  const sourceClass = classifyIpAddress(source);
  if (sourceClass !== "private" && sourceClass !== "loopback") {
    return false;
  }
  return (
    config.allowlist.length === 0 || config.allowlist.some((cidr) => cidrContains(cidr, source))
  );
}

function splitHostHeader(host: string): { name: string; port: string } | undefined {
  if (host.startsWith("[")) {
    const closing = host.indexOf("]");
    const rest = host.slice(closing + 1);
    return closing === -1 || !rest.startsWith(":")
      ? undefined
      : { name: host.slice(1, closing), port: rest.slice(1) };
  }
  const colon = host.lastIndexOf(":");
  return colon === -1 ? undefined : { name: host.slice(0, colon), port: host.slice(colon + 1) };
}

// Against DNS rebinding: a hostile page resolving to our address still sends
// its own name as Host. Accepted: the listen address, plus localhost and
// 127.0.0.1 in local mode, always with the server's port.
export function isHostAccepted(
  config: NetworkConfig,
  host: string | undefined,
  port: number,
): boolean {
  const parts = host === undefined ? undefined : splitHostHeader(host.toLowerCase());
  if (parts === undefined || parts.port !== String(port)) {
    return false;
  }
  if (config.mode === "local" && parts.name === "localhost") {
    return true;
  }
  const address = parseIpAddress(parts.name);
  if (address === undefined || (address.family === 6 && !host?.startsWith("["))) {
    return false;
  }
  const localAlias = parseIpAddress(DEFAULT_LISTEN_ADDRESS);
  const isLocalAlias =
    config.mode === "local" && localAlias !== undefined && sameIpAddress(address, localAlias);
  return sameIpAddress(address, config.listenIp) || isLocalAlias;
}

export function describeAcceptedHosts(config: NetworkConfig, port: number): string {
  const listenHost =
    config.listenIp.family === 6 ? `[${config.listenAddress}]` : config.listenAddress;
  const hosts = [`${listenHost}:${port}`];
  if (config.mode === "local") {
    hosts.push(`localhost:${port}`, `${DEFAULT_LISTEN_ADDRESS}:${port}`);
  }
  return [...new Set(hosts)].map((host) => `http://${host}`).join(" or ");
}
