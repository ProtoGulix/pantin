import type {
  BusTag,
  ConsoleResponse,
  PantinDocument,
  SimulationClockState,
  Tag,
  TagBusServerMessage,
  TransportKind,
} from "@pantin/protocol";
import { tagListSignature } from "./tags.ts";

// What one bus connection is sent after a scheduler tick (ADR 0045 point 4):
// pure, from what the connection last received and what the Pantin is now.

export type Subscription = "*" | ReadonlySet<string>;

// Everything a tick reads of a Pantin, taken at once.
export type FeedSource = {
  stepCount: number;
  document: PantinDocument;
  // The open mapping's id (ADR 0049 point 7), whole when `transport` is null and projected
  // on that transport otherwise (ADR 0065 point 7); null when it is missing or unreadable.
  mappingId(transport: TransportKind | null): string | null;
  // Counts the runtime resets and discards (ADR 0012 point 7).
  resetCount: number;
  consoleId: string;
  consoleLastSequence: number;
  readConsole(after: number): ConsoleResponse["entries"];
  clock: SimulationClockState;
  // Computed on demand: a connection with no subscription never needs it.
  tags(): Tag[];
};

export type FeedCursor = {
  // The transport a plc connection serves; null for a client, which follows the whole file.
  transport: TransportKind | null;
  resetCount: number;
  document: PantinDocument;
  mappingId: string | null;
  tagListSignature: string;
  consoleId: string;
  consoleSequence: number;
  clock: SimulationClockState;
  clockSentAt: number;
  subscription: Subscription | null;
  lastSent: ReadonlyMap<string, BusTag>;
};

const CLOCK_MESSAGE_SECONDS = 1;

/** A connection that just said hello sees console entries from now on, not the backlog. */
export function initialFeedCursor(
  source: FeedSource,
  now: number,
  transport: TransportKind | null,
): FeedCursor {
  return {
    transport,
    resetCount: source.resetCount,
    document: source.document,
    mappingId: source.mappingId(transport),
    tagListSignature: tagListSignature(source.document),
    consoleId: source.consoleId,
    consoleSequence: source.consoleLastSequence,
    clock: source.clock,
    clockSentAt: now,
    subscription: null,
    lastSent: new Map(),
  };
}

export function toBusTag(tag: Tag): BusTag {
  return { name: tag.name, value: tag.value, forced: tag.forced };
}

/** The tags a subscription covers; names the Pantin does not have are left out. */
export function subscribedTags(tags: readonly Tag[], subscription: Subscription): BusTag[] {
  return tags
    .filter((tag) => subscription === "*" || subscription.has(tag.name))
    .map((tag) => toBusTag(tag));
}

function isSameTag(first: BusTag | undefined, second: BusTag): boolean {
  return first !== undefined && first.value === second.value && first.forced === second.forced;
}

function indexByName(tags: readonly BusTag[]): ReadonlyMap<string, BusTag> {
  return new Map(tags.map((tag) => [tag.name, tag]));
}

/** The cursor of a connection that was just sent a snapshot of `tags`. */
export function subscribedCursor(
  cursor: FeedCursor,
  subscription: Subscription,
  tags: readonly BusTag[],
): FeedCursor {
  return { ...cursor, subscription, lastSent: indexByName(tags) };
}

function shouldSendClock(cursor: FeedCursor, clock: SimulationClockState, now: number): boolean {
  if (clock.running !== cursor.clock.running) {
    return true;
  }
  // A paused Pantin moves only when a step is requested; a running one is
  // reported once a second, like the clock event of the pose stream.
  return clock.running
    ? now - cursor.clockSentAt >= CLOCK_MESSAGE_SECONDS
    : clock.step !== cursor.clock.step;
}

function tagMessages(
  cursor: FeedCursor,
  source: FeedSource,
): { cursor: FeedCursor; messages: TagBusServerMessage[] } {
  const { subscription } = cursor;
  if (subscription === null) {
    return { cursor, messages: [] };
  }
  const current = subscribedTags(source.tags(), subscription);
  if (source.resetCount !== cursor.resetCount) {
    return {
      cursor: { ...cursor, lastSent: indexByName(current) },
      messages: [{ type: "snapshot", step: source.stepCount, tags: current }],
    };
  }
  const changed = current.filter((tag) => !isSameTag(cursor.lastSent.get(tag.name), tag));
  if (changed.length === 0) {
    return { cursor, messages: [] };
  }
  const lastSent = new Map(cursor.lastSent);
  for (const tag of changed) {
    lastSent.set(tag.name, tag);
  }
  return {
    cursor: { ...cursor, lastSent },
    messages: [{ type: "tags", step: source.stepCount, tags: changed }],
  };
}

/**
 * The messages to send after a tick, and the cursor to keep: `io_changed`
 * when the tag list or the mapping changed, then the snapshot (after a reset or discard) or
 * the changed tags, then each console entry new or folded since, then the
 * clock.
 */
export function nextFeed(
  cursor: FeedCursor,
  source: FeedSource,
  now: number,
): { cursor: FeedCursor; messages: TagBusServerMessage[] } {
  const messages: TagBusServerMessage[] = [];
  let next = cursor;
  const signature =
    source.document === cursor.document
      ? cursor.tagListSignature
      : tagListSignature(source.document);
  const mappingId = source.mappingId(cursor.transport);
  // One message even when the tag list and the mapping both changed: the bridge exits on
  // the first (ADR 0049 point 7). A plc connection hears of its own projection only, which
  // already holds the type and direction of its tags (ADR 0065 point 7).
  const tagListChanged = cursor.transport === null && signature !== cursor.tagListSignature;
  if (tagListChanged || mappingId !== cursor.mappingId) {
    messages.push({ type: "io_changed" });
  }
  next = {
    ...next,
    document: source.document,
    mappingId,
    tagListSignature: signature,
  };
  const tags = tagMessages(next, source);
  next = { ...tags.cursor, resetCount: source.resetCount };
  messages.push(...tags.messages);
  // A new console means the sequences started over (ADR 0031): read it from the start.
  const after = source.consoleId === next.consoleId ? next.consoleSequence : 0;
  for (const entry of source.readConsole(after)) {
    // ADR 0061 point 2: the PLC already has the tag values behind a trace line.
    if (entry.level !== "trace") {
      messages.push({ type: "console", entry });
    }
  }
  next = { ...next, consoleId: source.consoleId, consoleSequence: source.consoleLastSequence };
  if (shouldSendClock(next, source.clock, now)) {
    messages.push({ type: "clock", clock: source.clock });
    next = { ...next, clock: source.clock, clockSentAt: now };
  } else {
    next = { ...next, clock: source.clock };
  }
  return { cursor: next, messages };
}
