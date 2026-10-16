import {
  TAG_BUS_CLOSE_CODES,
  TAG_BUS_HELLO_TIMEOUT_SECONDS,
  TAG_BUS_PONG_TIMEOUT_SECONDS,
} from "@pantin/protocol";
import { nextFeed } from "../domain/bus-feed.ts";
import { watchdogTags } from "../domain/io-mapping.ts";
import { INTERNAL_ERROR_CLOSE_CODE } from "./bus-hello.ts";
import { handleFrame } from "./bus-messages.ts";
import {
  type BusConnectionDeps,
  type BusConnectionInit,
  type BusContext,
  newBusContext,
} from "./bus-session.ts";

// One tag bus connection (ADR 0045 point 4). The socket is behind `BusSocket`;
// messages are handled one after the other, in the order they arrived.

export type BusConnection = {
  receive(text: string, isBinary: boolean): void;
  pongReceived(now: number): void;
  // Sends what the tick changed (tags, console, clock).
  tick(now: number): void;
  // Called every second: closes a silent or unresponsive connection, else pings.
  housekeep(now: number): void;
  // The socket closed, however it did.
  closed(): void;
};

// The PLC is gone: the bit commands mapped on any module reset (point 11).
async function announceLoss(context: BusContext): Promise<void> {
  const { deps, init, session } = context;
  if (session.ownsPlcSlot) {
    deps.plcSlots.release(init.pantinId, context.owner);
  }
  if (session.bridgeAnnounced && !deps.isClosing()) {
    const tags = session.mapping === null ? [] : watchdogTags(session.mapping);
    await deps.service.bridgeDisconnected(init.pantinId, session.lossReason, tags);
  }
}

function sendTick(context: BusContext, now: number): void {
  const { session, deps, init } = context;
  const feed = session.cursor === null ? undefined : deps.service.peekFeedSource(init.pantinId);
  if (session.cursor === null || feed === undefined || session.done) {
    return;
  }
  const next = nextFeed(session.cursor, feed, now);
  session.cursor = next.cursor;
  next.messages.forEach(context.send);
}

function housekeep(context: BusContext, now: number): void {
  const { session, init } = context;
  if (session.done) {
    return;
  }
  if (!session.spoke && now - init.openedAt >= TAG_BUS_HELLO_TIMEOUT_SECONDS) {
    context.fail(TAG_BUS_CLOSE_CODES.helloTimeout, "No hello within 5 seconds.");
  } else if (now - session.lastPongAt >= TAG_BUS_PONG_TIMEOUT_SECONDS) {
    session.lossReason = "timeout";
    init.socket.terminate();
  } else {
    init.socket.ping();
  }
}

export function createBusConnection(
  deps: BusConnectionDeps,
  init: BusConnectionInit,
): BusConnection {
  const context = newBusContext(deps, init);
  let queue: Promise<void> = Promise.resolve();
  // Serialised: a later message waits for the earlier one, which may be
  // reading the mapping. An unexpected error ends the connection.
  const enqueue = (task: () => Promise<void>) => {
    queue = queue.then(task).catch((error: unknown) => {
      deps.reportError(error);
      context.fail(INTERNAL_ERROR_CLOSE_CODE, "Internal error.");
    });
  };
  return {
    receive: (text, isBinary) => {
      context.session.spoke = true;
      enqueue(() => handleFrame(context, text, isBinary));
    },
    pongReceived: (now) => {
      context.session.lastPongAt = now;
    },
    tick: (now) => sendTick(context, now),
    housekeep: (now) => housekeep(context, now),
    closed: () => {
      context.session.done = true;
      enqueue(() => announceLoss(context));
    },
  };
}
