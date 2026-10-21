import {
  TAG_BUS_CLOSE_CODES,
  TAG_BUS_VERSION,
  type TagBusClientMessage,
  type TransportKind,
} from "@pantin/protocol";
import { initialFeedCursor } from "../domain/bus-feed.ts";
import { isPlcRoleAccepted } from "../domain/bus-upgrade-rules.ts";
import type { BusContext } from "./bus-session.ts";

// The hello that opens a connection (ADR 0045 point 4).

const CLOSE = TAG_BUS_CLOSE_CODES;
// WebSocket "internal error" (RFC 6455 section 7.4.1).
export const INTERNAL_ERROR_CLOSE_CODE = 1011;

// The `plc` role: from the core's host (ADR 0046 point 6), one per Pantin and transport
// (4002), and with the projection of the mapping the bridge started with (4003).
async function acceptPlc(
  context: BusContext,
  transport: TransportKind,
  mappingId: string | undefined,
): Promise<boolean> {
  const { deps, init, session } = context;
  if (!isPlcRoleAccepted(deps.network, init.remoteAddress)) {
    context.fail(CLOSE.roleNotAccepted, "The plc role is accepted from the core's own host only.");
    return false;
  }
  if (!deps.plcSlots.claim(init.pantinId, transport, context.owner)) {
    context.fail(
      CLOSE.plcAlreadyConnected,
      `Another plc connection of the ${transport} transport is already open on this Pantin.`,
    );
    return false;
  }
  session.ownsPlcSlot = true;
  session.transport = transport;
  const mapping = await deps.mappingSource.read(init.pantinId, transport);
  // ADR 0045 points 7 and 10: the watchdog needs the mapping, and a bridge
  // runs on the mapping it read; with none, or another one, there is nothing
  // for a plc to do.
  if (mapping === null) {
    context.fail(
      CLOSE.mappingMismatch,
      `This Pantin has no valid io mapping for the ${transport} transport.`,
    );
    return false;
  }
  if (mapping.mappingId !== mappingId) {
    context.fail(
      CLOSE.mappingMismatch,
      "The io mapping changed since the bridge read it: restart it.",
    );
    return false;
  }
  session.mapping = mapping;
  return true;
}

export async function handleHello(
  context: BusContext,
  message: Extract<TagBusClientMessage, { type: "hello" }>,
): Promise<void> {
  const { deps, init, session } = context;
  if (message.version !== TAG_BUS_VERSION) {
    context.fail(
      CLOSE.unsupportedVersion,
      `Version ${message.version} is not supported: use ${TAG_BUS_VERSION}.`,
    );
    return;
  }
  if (message.role === "plc") {
    // The schema requires the transport of a version 2 plc hello; a missing one is a bug.
    if (message.transport === undefined) {
      context.fail(CLOSE.invalidMessage, "A plc hello carries its transport.");
      return;
    }
    if (!(await acceptPlc(context, message.transport, message.mappingId))) {
      return;
    }
    // Before the await: a close during it must still announce the loss.
    session.bridgeAnnounced = true;
    await deps.service.bridgeConnected(init.pantinId, message.transport);
  }
  const feed = deps.service.peekFeedSource(init.pantinId);
  if (feed === undefined || session.done) {
    context.fail(INTERNAL_ERROR_CLOSE_CODE, "The Pantin is no longer open.");
    return;
  }
  session.role = message.role;
  session.cursor = initialFeedCursor(feed, init.openedAt, session.transport);
  context.send({
    type: "welcome",
    version: TAG_BUS_VERSION,
    consoleId: feed.consoleId,
    clock: feed.clock,
  });
}
