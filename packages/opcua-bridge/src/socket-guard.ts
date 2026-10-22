import { subscribe, unsubscribe } from "node:diagnostics_channel";
import type { Socket } from "node:net";
import {
  classifyAddress,
  classifyOutgoingTarget,
  type NetworkScope,
  parseIpAddress,
  sameIpAddress,
} from "@pantin/network-address";
import type { Logger } from "./logger.ts";

// ADR 0065 point 8: after the connection, the address the socket really reached is classified
// again. node-opcua keeps its transport private, so the sockets are observed from outside: Node
// publishes every client socket on the `net.client.socket` channel, and the bridge opens no
// other client socket once its sessions start (the tag bus is open before). A socket that
// reaches anything other than a module's own address and port is destroyed.

const CHANNEL = "net.client.socket";

export type GuardedEndpoint = { target: string; port: number };

type SocketAnnouncement = { socket: Socket };

function scopeOf(target: string): NetworkScope {
  return classifyAddress(target) === "loopback" ? "local" : "lan";
}

/** Why the socket is refused, or `undefined` when it reached one of the endpoints. */
export function refusalOfRemote(
  remoteAddress: string | undefined,
  remotePort: number | undefined,
  endpoints: readonly GuardedEndpoint[],
): string | undefined {
  const remote = remoteAddress === undefined ? undefined : parseIpAddress(remoteAddress);
  if (remote === undefined || remoteAddress === undefined) {
    return "its remote address is unknown";
  }
  const reached = endpoints.find((endpoint) => {
    const target = parseIpAddress(endpoint.target);
    return target !== undefined && sameIpAddress(target, remote) && endpoint.port === remotePort;
  });
  if (reached === undefined) {
    return `${remoteAddress}:${remotePort} is not the address and port of any module`;
  }
  const classification = classifyOutgoingTarget(remoteAddress, scopeOf(reached.target));
  return classification.accepted ? undefined : classification.message;
}

/** Starts watching; the returned function stops it. */
export function guardOutgoingSockets(
  endpoints: readonly GuardedEndpoint[],
  log: Logger,
): () => void {
  const onSocket = (announcement: unknown): void => {
    const { socket } = announcement as SocketAnnouncement; // the documented message shape
    socket.once("connect", () => {
      const refusal = refusalOfRemote(socket.remoteAddress, socket.remotePort, endpoints);
      if (refusal !== undefined) {
        log.error(`A connection was closed before any exchange: ${refusal} (ADR 0065 point 8).`);
        socket.destroy();
      }
    });
  };
  subscribe(CHANNEL, onSocket);
  return () => {
    unsubscribe(CHANNEL, onSocket);
  };
}
