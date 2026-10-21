import { classifyIpAddress, parseIpAddress, sameIpAddress } from "@pantin/network-address";
import type { ApiErrorCode } from "@pantin/protocol";
import { describeAcceptedHosts, isHostAccepted, type NetworkConfig } from "./network-config.ts";

// What decides whether a tag bus connection may start (ADR 0046 points 5 to
// 7). Pure: the HTTP upgrade handler reads the request and acts on the answer.

// Set by the nginx site of the Cloudflare exposure (ADR 0014, ADR 0046 point 7).
export const EXPOSURE_HEADER = "x-pantin-exposure";

export type UpgradeRefusal = { status: 403 | 421; code: ApiErrorCode; message: string };

export type UpgradeHeaders = {
  host: string | undefined;
  origin: string | undefined;
  exposure: string | undefined;
};

function refusal(status: 403 | 421, message: string): UpgradeRefusal {
  return { status, code: "invalid_request", message };
}

// A browser sends the Origin of the page that opened the socket; a page of
// any site can open ws://127.0.0.1:... from the user's browser, and sends the
// core's own Host. The Origin is therefore what tells that page apart: it
// must be http:// plus one of the hosts the core accepts. A missing Origin is
// a program, not a browser (the bridge), and is accepted.
function isOriginAccepted(network: NetworkConfig, origin: string, port: number): boolean {
  const scheme = "http://";
  if (!origin.toLowerCase().startsWith(scheme)) {
    return false;
  }
  const authority = origin.slice(scheme.length);
  return !authority.includes("/") && isHostAccepted(network, authority, port);
}

/** Host first, then Origin, then the exposure header; null when the bus may open. */
export function checkUpgradeHeaders(
  network: NetworkConfig,
  headers: UpgradeHeaders,
  port: number,
): UpgradeRefusal | null {
  if (!isHostAccepted(network, headers.host, port)) {
    return refusal(
      421,
      `Host "${headers.host ?? ""}" is not accepted. Open the core at ${describeAcceptedHosts(network, port)}.`,
    );
  }
  if (headers.origin !== undefined && !isOriginAccepted(network, headers.origin, port)) {
    return refusal(
      403,
      `Origin "${headers.origin}" is not accepted: the tag bus answers pages served by the core only.`,
    );
  }
  if (headers.exposure !== undefined) {
    return refusal(
      403,
      "The tag bus is not served through the Cloudflare exposure (ADR 0046 point 7).",
    );
  }
  return null;
}

/**
 * The `plc` role comes from the core's own host (ADR 0046 point 6): loopback,
 * or the core's listen address in `lan` mode, where the core listens on that
 * private address alone and a bridge on the same host connects from it.
 */
export function isPlcRoleAccepted(
  network: NetworkConfig,
  remoteAddress: string | undefined,
): boolean {
  const source = remoteAddress === undefined ? undefined : parseIpAddress(remoteAddress);
  if (source === undefined) {
    return false;
  }
  if (classifyIpAddress(source) === "loopback") {
    return true;
  }
  return network.mode === "lan" && sameIpAddress(source, network.listenIp);
}
