import type { PantinId, TagBusRole, TagBusServerMessage, TransportKind } from "@pantin/protocol";
import type { FeedCursor } from "../domain/bus-feed.ts";
import type { ConnectionLossReason } from "../domain/console-events.ts";
import type { IoMapping, IoMappingSource } from "../domain/io-mapping.ts";
import type { NetworkConfig } from "../domain/network-config.ts";
import type { PantinService } from "../service/pantin-service.ts";
import type { BusSocket } from "./bus-socket.ts";

// The parts every handler of one bus connection shares.

export type BusService = Pick<
  PantinService,
  | "writeTag"
  | "releaseTag"
  | "releaseAllTags"
  | "peekFeedSource"
  | "bridgeConnected"
  | "bridgeDisconnected"
  | "plcModuleStatus"
>;

// At most one `plc` connection per Pantin and transport, held by the registry (ADR 0065
// point 7): each kind of bridge has its own.
export type PlcSlots = {
  claim(pantinId: PantinId, transport: TransportKind, owner: object): boolean;
  release(pantinId: PantinId, transport: TransportKind, owner: object): void;
};

export type BusConnectionDeps = {
  service: BusService;
  network: NetworkConfig;
  mappingSource: IoMappingSource;
  plcSlots: PlcSlots;
  reportError: (error: unknown) => void;
  // True once the core is closing: its connections then end without the
  // watchdog writes, which would load Pantins that are being released.
  isClosing: () => boolean;
};

export type BusConnectionInit = {
  pantinId: PantinId;
  remoteAddress: string | undefined;
  socket: BusSocket;
  // Monotonic seconds when the socket opened.
  openedAt: number;
};

// A peer that stops reading would otherwise let the core buffer its output
// until the 3 s pong timeout ends the connection. Past this many unread bytes
// it closes with 1008, "policy violation": the peer is not keeping up with the
// bus, and trying again later would not help.
const MAX_BUFFERED_BYTES = 1024 * 1024;
const POLICY_VIOLATION_CLOSE_CODE = 1008;

type Session = {
  role: TagBusRole | null;
  // The transport a plc connection serves, set by its hello.
  transport: TransportKind | null;
  // Something was received: the hello deadline is met, even if it is wrong.
  spoke: boolean;
  lastPongAt: number;
  cursor: FeedCursor | null;
  mapping: IoMapping | null;
  ownsPlcSlot: boolean;
  // The bridge was announced to the service (bridge_connected), so its loss must be.
  bridgeAnnounced: boolean;
  lossReason: ConnectionLossReason;
  // Closing or closed: nothing more is read or sent.
  done: boolean;
};

export type BusContext = {
  deps: BusConnectionDeps;
  init: BusConnectionInit;
  session: Session;
  // Identifies the connection to the plc slots.
  owner: object;
  send(message: TagBusServerMessage): void;
  // Ends the connection with an application close code (TAG_BUS_CLOSE_CODES).
  fail(code: number, reason: string): void;
};

export function newBusContext(deps: BusConnectionDeps, init: BusConnectionInit): BusContext {
  const session: Session = {
    role: null,
    transport: null,
    spoke: false,
    lastPongAt: init.openedAt,
    cursor: null,
    mapping: null,
    ownsPlcSlot: false,
    bridgeAnnounced: false,
    lossReason: "closed",
    done: false,
  };
  const fail = (code: number, reason: string) => {
    session.done = true;
    init.socket.close(code, reason);
  };
  return {
    deps,
    init,
    session,
    owner: {},
    send: (message) => {
      if (session.done) {
        return;
      }
      init.socket.send(JSON.stringify(message));
      if (init.socket.bufferedAmount() > MAX_BUFFERED_BYTES) {
        fail(POLICY_VIOLATION_CLOSE_CODE, "The peer does not read its messages.");
      }
    },
    fail,
  };
}
