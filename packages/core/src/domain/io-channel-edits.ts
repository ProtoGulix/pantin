import type { IoChannel, IoDocument, IoModule, UpdateIoChannelRequest } from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { allocateVariable, proposeAddress, zoneAndTypeOf } from "./io-allocation.ts";
import { requireModule } from "./io-module-edits.ts";
import { ioWidthOf } from "./io-rules.ts";
import type { IoTag } from "./io-validation.ts";

// The channel edits of ADR 0049 point 4, on a mapping already parsed: pure.
// The client never sends a zone or a PLC type, the tag gives them.

const allChannels = (document: IoDocument): IoChannel[] =>
  document.modules.flatMap((module) => module.channels);

function findChannel(document: IoDocument, tagName: string): IoChannel | undefined {
  return allChannels(document).find((channel) => channel.tag === tagName);
}

function requireDocumentTag(tags: readonly IoTag[], tagName: string): IoTag {
  const tag = tags.find((candidate) => candidate.name === tagName);
  if (tag === undefined) {
    throw new ApiError(
      "invalid_request",
      `This Pantin has no tag "${tagName}". List the tags with GET /api/pantins/<id>/tags.`,
    );
  }
  return tag;
}

function requireUnmapped(document: IoDocument, tagName: string): void {
  if (findChannel(document, tagName) !== undefined) {
    throw new ApiError(
      "conflict",
      `Tag "${tagName}" is already mapped: a tag is mapped once. Edit its channel instead.`,
    );
  }
}

function noFreeAddress(zone: string, moduleKey: string): ApiError {
  return new ApiError(
    "conflict",
    `Module "${moduleKey}" has no free address left in zone ${zone}: use another module.`,
  );
}

function withModule(document: IoDocument, module: IoModule): IoDocument {
  return {
    ...document,
    modules: document.modules.map((existing) => (existing.key === module.key ? module : existing)),
  };
}

function newChannel(document: IoDocument, module: IoModule, tag: IoTag): IoChannel {
  const { zone, ioType } = zoneAndTypeOf(tag.type, tag.direction);
  const address = proposeAddress(module.channels, zone, ioType);
  if (address === null) {
    throw noFreeAddress(zone, module.key);
  }
  const variable = allocateVariable(
    tag.name,
    allChannels(document).map((channel) => channel.variable),
  );
  return { tag: tag.name, variable, zone, address, ioType, comment: "" };
}

/** Maps each tag into the module; nothing is added if one tag is refused. */
export function addChannels(
  document: IoDocument,
  moduleKey: string,
  tagNames: readonly string[],
  tags: readonly IoTag[],
): IoDocument {
  requireModule(document, moduleKey);
  // Every tag is checked first: a refused request changes nothing.
  const wanted = tagNames.map((name) => requireDocumentTag(tags, name));
  for (const name of tagNames) {
    requireUnmapped(document, name);
  }
  return wanted.reduce((edited, tag) => {
    const module = requireModule(edited, moduleKey);
    const channel = newChannel(edited, module, tag);
    return withModule(edited, { ...module, channels: [...module.channels, channel] });
  }, document);
}

/** Unmaps a tag. */
export function removeChannel(document: IoDocument, tagName: string): IoDocument {
  requireChannel(document, tagName);
  return {
    ...document,
    modules: document.modules.map((module) => ({
      ...module,
      channels: module.channels.filter((channel) => channel.tag !== tagName),
    })),
  };
}

/** The channel a path names, or the 404 of the route. */
function requireChannel(document: IoDocument, tagName: string): IoChannel {
  const channel = findChannel(document, tagName);
  if (channel === undefined) {
    throw new ApiError(
      "not_found",
      `Tag "${tagName}" is not mapped. List the channels with GET /api/pantins/<id>/io.`,
    );
  }
  return channel;
}

// A `tag` in the request, even unchanged, derives the zone and type again.
function targetTag(
  document: IoDocument,
  channel: IoChannel,
  request: UpdateIoChannelRequest,
  tags: readonly IoTag[],
): IoTag | null {
  if (request.tag === undefined) {
    return null;
  }
  const tag = requireDocumentTag(tags, request.tag);
  if (tag.name !== channel.tag) {
    requireUnmapped(document, tag.name);
  }
  return tag;
}

function targetModule(document: IoDocument, from: IoModule, request: UpdateIoChannelRequest) {
  if (request.module === undefined) {
    return from;
  }
  const module = document.modules.find((candidate) => candidate.key === request.module);
  if (module === undefined) {
    throw new ApiError(
      "invalid_request",
      `The mapping has no module "${request.module}" to move the channel to.`,
    );
  }
  return module;
}

/** Edits a channel; a new address is proposed when the zone, width or module changes. */
export function updateChannel(
  document: IoDocument,
  tagName: string,
  request: UpdateIoChannelRequest,
  tags: readonly IoTag[],
): IoDocument {
  const channel = requireChannel(document, tagName);
  const source = document.modules.find((module) => module.channels.includes(channel));
  if (source === undefined) {
    throw new Error(`Channel "${tagName}" belongs to no module.`);
  }
  const tag = targetTag(document, channel, request, tags);
  const target = targetModule(document, source, request);
  const derived =
    tag === null ? channel : { ...channel, ...zoneAndTypeOf(tag.type, tag.direction) };
  const moved = target.key !== source.key;
  const reshaped =
    derived.zone !== channel.zone || ioWidthOf(derived.ioType) !== ioWidthOf(channel.ioType);
  const others = target.channels.filter((candidate) => candidate !== channel);
  const address =
    request.address ??
    (moved || reshaped ? proposeAddress(others, derived.zone, derived.ioType) : channel.address);
  if (address === null) {
    throw noFreeAddress(derived.zone, target.key);
  }
  const edited: IoChannel = {
    ...derived,
    tag: tag?.name ?? channel.tag,
    variable: request.variable ?? channel.variable,
    comment: request.comment ?? channel.comment,
    address,
  };
  return replaceChannel(document, channel, edited, target.key);
}

// The channel leaves its module and joins the target one, which may be the same.
function replaceChannel(
  document: IoDocument,
  channel: IoChannel,
  edited: IoChannel,
  targetKey: string,
): IoDocument {
  return {
    ...document,
    modules: document.modules.map((module) => ({
      ...module,
      channels: [
        ...module.channels.filter((candidate) => candidate !== channel),
        ...(module.key === targetKey ? [edited] : []),
      ],
    })),
  };
}
