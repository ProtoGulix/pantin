import type { TagBusServerMessage } from "@pantin/protocol";
import type { BusClient } from "./bus-client.ts";
import { deferred } from "./deferred.ts";
import { MappingChangedError } from "./errors.ts";
import type { Logger } from "./logger.ts";
import type { ModuleSessions } from "./opcua/session.ts";

// The bridge in service: what it does with each message of the core, and how it ends
// (ADR 0065 point 5, the contract of the Python bridge).

/** One message of the core. Throws the error that ends the bridge, if the message is one. */
export function handleMessage(
  message: TagBusServerMessage,
  sessions: ModuleSessions,
  log: Logger,
): void {
  switch (message.type) {
    case "snapshot":
    case "tags":
      sessions.applyTags(message);
      return;
    case "io_changed":
      throw new MappingChangedError(
        "The Pantin's tags changed, so the io mapping may no longer match: restart the bridge.",
      );
    case "ack":
      if (message.ignored === "forced") {
        // The core's own console line in the bridge log says why (ADR 0054 amendment).
        log.info(
          `PLC write to ${message.tag?.name ?? "a tag"} ignored: the tag is forced in the core.`,
        );
      }
      return;
    case "error":
      log.warning(`Core error ${message.code}: ${message.message}`);
      return;
    default:
      // welcome (handled at start), clock and console entries need nothing.
      return;
  }
}

/**
 * Serves until `terminated` settles (a clean stop, returns) or something fails (throws).
 * Every end of the bus is an error: the bridge does not reconnect to the core (ADR 0050).
 */
export async function serve(options: {
  bus: BusClient;
  sessions: ModuleSessions;
  log: Logger;
  terminated: Promise<void>;
}): Promise<void> {
  const { bus, sessions, log } = options;
  const failure = deferred<unknown>();
  bus.onMessage((message) => {
    try {
      handleMessage(message, sessions, log);
    } catch (error) {
      failure.resolve(error);
    }
  });
  const outcome: unknown = await Promise.race([
    options.terminated.then(() => null),
    bus.ended,
    failure.promise,
    sessions.failed,
  ]);
  if (outcome !== null) {
    throw outcome;
  }
}
