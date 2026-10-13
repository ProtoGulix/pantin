import {
  type ApiErrorCode,
  TAG_BUS_CLOSE_CODES,
  type TagBusClientMessage,
  TagBusClientMessageSchema,
  type TagBusServerMessage,
} from "@pantin/protocol";
import {
  type Subscription,
  subscribedCursor,
  subscribedTags,
  toBusTag,
} from "../domain/bus-feed.ts";
import { watchdogTags } from "../domain/io-mapping.ts";
import { ApiError } from "../errors.ts";
import { handleHello } from "./bus-hello.ts";
import type { BusContext } from "./bus-session.ts";

// What each message of a connection does once it said hello (ADR 0045 point 4).

const CLOSE = TAG_BUS_CLOSE_CODES;

type MessageOf<Type extends TagBusClientMessage["type"]> = Extract<
  TagBusClientMessage,
  { type: Type }
>;

function decodeClientMessage(text: string): TagBusClientMessage | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const result = TagBusClientMessageSchema.safeParse(json);
  return result.success ? result.data : null;
}

function errorMessage(id: string | null, code: ApiErrorCode, message: string): TagBusServerMessage {
  return { type: "error", id, code, message };
}

function handleSubscribe(context: BusContext, message: MessageOf<"subscribe">): void {
  const { session, init, deps } = context;
  const feed = deps.service.peekFeedSource(init.pantinId);
  if (feed === undefined || session.cursor === null) {
    return;
  }
  const tags = feed.tags();
  const known = new Set(tags.map((tag) => tag.name));
  const unknown = message.tags === "*" ? [] : message.tags.filter((name) => !known.has(name));
  if (unknown.length > 0) {
    context.send(
      errorMessage(null, "not_found", `No tag "${unknown.join('", "')}" to subscribe to.`),
    );
    return;
  }
  const subscription: Subscription = message.tags === "*" ? "*" : new Set(message.tags);
  const subscribed = subscribedTags(tags, subscription);
  session.cursor = subscribedCursor(session.cursor, subscription, subscribed);
  context.send({ type: "snapshot", step: feed.stepCount, tags: subscribed });
}

async function handleWrite(context: BusContext, message: MessageOf<"write">): Promise<void> {
  const source = context.session.role === "plc" ? "plc" : "client";
  const { service } = context.deps;
  const outcome = await service.writeTag(context.init.pantinId, message.tag, message.value, source);
  context.send({
    type: "ack",
    id: message.id,
    tag: toBusTag(outcome.tag),
    ignored: outcome.ignored,
  });
}

async function handleRelease(context: BusContext, message: MessageOf<"release">): Promise<void> {
  const { service } = context.deps;
  if (message.tag === undefined) {
    await service.releaseAllTags(context.init.pantinId);
    context.send({ type: "ack", id: message.id, tag: null, ignored: null });
    return;
  }
  const tag = await service.releaseTag(context.init.pantinId, message.tag);
  context.send({ type: "ack", id: message.id, tag: toBusTag(tag), ignored: null });
}

async function handlePlcStatus(
  context: BusContext,
  message: MessageOf<"plc_status">,
): Promise<void> {
  const { mapping } = context.session;
  const status = message.connected
    ? ({ connected: true } as const)
    : // The schema gives a disconnected module a reason; the fallback only satisfies the type.
      ({ connected: false, reason: message.reason ?? "closed" } as const);
  const tags = message.connected || mapping === null ? [] : watchdogTags(mapping, message.module);
  await context.deps.service.plcModuleStatus(context.init.pantinId, message.module, status, tags);
}

// A write or release the Pantin refuses is answered, not fatal.
async function answerErrors(
  context: BusContext,
  id: string | null,
  action: () => Promise<void>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    context.send(errorMessage(id, error.code, error.message));
  }
}

async function handleReadyMessage(
  context: BusContext,
  message: TagBusClientMessage,
): Promise<void> {
  const { role } = context.session;
  switch (message.type) {
    case "hello":
      context.fail(CLOSE.invalidMessage, "hello was already sent.");
      return;
    case "subscribe":
      handleSubscribe(context, message);
      return;
    case "write":
      await answerErrors(context, message.id, () => handleWrite(context, message));
      return;
    case "release":
      if (role !== "client") {
        context.fail(CLOSE.invalidMessage, "release is for the client role.");
        return;
      }
      await answerErrors(context, message.id, () => handleRelease(context, message));
      return;
    case "plc_status":
      if (role !== "plc") {
        context.fail(CLOSE.invalidMessage, "plc_status is for the plc role.");
        return;
      }
      await answerErrors(context, null, () => handlePlcStatus(context, message));
      return;
  }
}

export async function handleFrame(
  context: BusContext,
  text: string,
  isBinary: boolean,
): Promise<void> {
  if (context.session.done) {
    return;
  }
  const message = isBinary ? null : decodeClientMessage(text);
  if (message === null) {
    context.fail(
      CLOSE.invalidMessage,
      "Not a tag bus message: send one JSON text frame (tag-bus.ts).",
    );
  } else if (context.session.role === null) {
    if (message.type === "hello") {
      await handleHello(context, message);
    } else {
      context.fail(CLOSE.invalidMessage, "The first message must be hello.");
    }
  } else {
    await handleReadyMessage(context, message);
  }
}
