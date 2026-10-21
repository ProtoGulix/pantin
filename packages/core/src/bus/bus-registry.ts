import {
  type PantinId,
  TAG_BUS_MAX_CONNECTIONS,
  TAG_BUS_PING_SECONDS,
  type TransportKind,
} from "@pantin/protocol";
import type { IoMappingSource } from "../domain/io-mapping.ts";
import type { NetworkConfig } from "../domain/network-config.ts";
import type { SimulationTimer } from "../service/simulation-loop.ts";
import { type BusConnection, createBusConnection } from "./bus-connection.ts";
import type { BusService, PlcSlots } from "./bus-session.ts";
import type { BusSocket } from "./bus-socket.ts";

// The open tag bus connections of one core (ADR 0045 point 4): the cap, the
// single plc per Pantin and transport, the once-a-second housekeeping and the tick feed.
// Like the pose stream registry, it runs without any socket library.

export type BusRegistry = {
  // Null when the core already serves its maximum of connections.
  attach(
    socket: BusSocket,
    origin: { pantinId: PantinId; remoteAddress: string | undefined },
  ): BusConnection | null;
  // To call after every simulation tick.
  notifyTick(): void;
  isFull(): boolean;
  // Drops every connection with no handshake and stops the housekeeping.
  closeAll(): void;
};

export type BusRegistryOptions = {
  service: BusService;
  network: NetworkConfig;
  mappingSource: IoMappingSource;
  // Its clock dates hellos and pongs, its repeat paces the pings.
  timer: SimulationTimer;
  reportError: (error: unknown) => void;
};

// One slot per (Pantin, transport). The id of a Pantin is a key, which has no newline.
function slotKeyOf(pantinId: PantinId, transport: TransportKind): string {
  return `${pantinId}\n${transport}`;
}

function createPlcSlots(): PlcSlots {
  const owners = new Map<string, object>();
  return {
    claim: (pantinId, transport, owner) => {
      const key = slotKeyOf(pantinId, transport);
      if (owners.has(key)) {
        return false;
      }
      owners.set(key, owner);
      return true;
    },
    release: (pantinId, transport, owner) => {
      const key = slotKeyOf(pantinId, transport);
      if (owners.get(key) === owner) {
        owners.delete(key);
      }
    },
  };
}

export function createBusRegistry(options: BusRegistryOptions): BusRegistry {
  const { timer } = options;
  const open = new Map<BusConnection, BusSocket>();
  const plcSlots = createPlcSlots();
  let closing = false;
  const stopHousekeeping = timer.repeat(TAG_BUS_PING_SECONDS, () => {
    const now = timer.now();
    for (const connection of [...open.keys()]) {
      connection.housekeep(now);
    }
  });
  return {
    attach: (socket, origin) => {
      if (open.size >= TAG_BUS_MAX_CONNECTIONS) {
        return null;
      }
      const connection = createBusConnection(
        {
          service: options.service,
          network: options.network,
          mappingSource: options.mappingSource,
          reportError: options.reportError,
          plcSlots,
          isClosing: () => closing,
        },
        { ...origin, socket, openedAt: timer.now() },
      );
      open.set(connection, socket);
      return {
        ...connection,
        closed: () => {
          open.delete(connection);
          connection.closed();
        },
      };
    },
    notifyTick: () => {
      const now = timer.now();
      for (const connection of [...open.keys()]) {
        connection.tick(now);
      }
    },
    isFull: () => open.size >= TAG_BUS_MAX_CONNECTIONS,
    closeAll: () => {
      closing = true;
      stopHousekeeping();
      for (const socket of open.values()) {
        socket.terminate();
      }
    },
  };
}
