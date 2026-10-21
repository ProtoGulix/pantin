import type { IoChannel, IoDocument, IoModule, UpdateIoChannelRequest } from "@pantin/protocol";
import type { ChannelProposal } from "@pantin/transport-types/rules";
import { ApiError } from "../errors.ts";
import { allocateVariable } from "./io-allocation.ts";
import { requireModule } from "./io-module-edits.ts";
import { rulesOf } from "./io-transports.ts";
import type { IoTag } from "./io-validation.ts";

// The channel edits of ADR 0049 point 4 and ADR 0064 point 6, on a mapping already
// parsed: pure. The client never sends transport fields the tag decides (a zone,
// a PLC type): the transport's rules derive them.

const allChannels = (document: IoDocument): IoChannel[] =>
  document.modules.flatMap((module) => module.channels);

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

// `ignoring` is the channel being edited, which does not conflict with itself.
function requireMappable(
  document: IoDocument,
  module: IoModule,
  tag: IoTag,
  ignoring?: IoChannel,
): void {
  const others = (channels: readonly IoChannel[]) =>
    channels.filter((channel) => channel !== ignoring && channel.tag === tag.name);
  if (others(module.channels).length > 0) {
    throw new ApiError(
      "conflict",
      `Tag "${tag.name}" is already mapped in module "${module.key}": a tag is mapped once per module. Edit its channel instead.`,
    );
  }
  if (tag.direction === "command" && others(allChannels(document)).length > 0) {
    throw new ApiError(
      "conflict",
      `Command "${tag.name}" is already mapped in another module: a command is mapped once.`,
    );
  }
  if (!rulesOf(module.transport).supportsSignal(tag)) {
    throw new ApiError(
      "invalid_request",
      `Tag "${tag.name}" (a ${tag.type} ${tag.direction}) cannot be carried by the ${module.transport.kind} transport of module "${module.key}": use a module of another transport.`,
    );
  }
}

function requireFields(proposal: ChannelProposal) {
  if ("refusal" in proposal) {
    throw new ApiError("conflict", proposal.refusal);
  }
  return proposal.fields;
}

function withModule(document: IoDocument, module: IoModule): IoDocument {
  return {
    ...document,
    modules: document.modules.map((existing) => (existing.key === module.key ? module : existing)),
  };
}

// The same tag in another module is one PLC variable fed by both: it keeps the name.
function variableFor(document: IoDocument, tagName: string): string {
  const mapped = allChannels(document).find((channel) => channel.tag === tagName);
  return (
    mapped?.variable ??
    allocateVariable(
      tagName,
      allChannels(document).map((channel) => channel.variable),
    )
  );
}

function newChannel(document: IoDocument, module: IoModule, tag: IoTag): IoChannel {
  const fields = requireFields(rulesOf(module.transport).proposeChannel(module, tag));
  return { tag: tag.name, variable: variableFor(document, tag.name), comment: "", ...fields };
}

/** Maps each tag into the module; nothing is added if one tag is refused. */
export function addChannels(
  document: IoDocument,
  moduleKey: string,
  tagNames: readonly string[],
  tags: readonly IoTag[],
): IoDocument {
  const module = requireModule(document, moduleKey);
  // Every tag is checked first: a refused request changes nothing.
  const wanted = tagNames.map((name) => requireDocumentTag(tags, name));
  for (const tag of wanted) {
    requireMappable(document, module, tag);
  }
  return wanted.reduce((edited, tag) => {
    const current = requireModule(edited, moduleKey);
    const channel = newChannel(edited, current, tag);
    return withModule(edited, { ...current, channels: [...current.channels, channel] });
  }, document);
}

/** The channel a path names, or the 404 of the route. */
function requireChannel(module: IoModule, tagName: string): IoChannel {
  const channel = module.channels.find((candidate) => candidate.tag === tagName);
  if (channel === undefined) {
    throw new ApiError(
      "not_found",
      `Tag "${tagName}" is not mapped in module "${module.key}". List the channels with GET /api/pantins/<id>/io.`,
    );
  }
  return channel;
}

/** Unmaps a tag from one module. */
export function removeChannel(
  document: IoDocument,
  moduleKey: string,
  tagName: string,
): IoDocument {
  const module = requireModule(document, moduleKey);
  const channel = requireChannel(module, tagName);
  return withModule(document, {
    ...module,
    channels: module.channels.filter((candidate) => candidate !== channel),
  });
}

function targetModule(document: IoDocument, source: IoModule, request: UpdateIoChannelRequest) {
  if (request.module === undefined) {
    return source;
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

// A `tag` in the request, even unchanged, derives the transport fields again, and so
// does a move; a plain variable or comment edit derives nothing.
function tagToDerive(
  document: IoDocument,
  channel: IoChannel,
  target: IoModule,
  moved: boolean,
  request: UpdateIoChannelRequest,
  tags: readonly IoTag[],
): IoTag | null {
  if (request.tag === undefined && !moved) {
    return null;
  }
  const tag = requireDocumentTag(tags, request.tag ?? channel.tag);
  if (moved || tag.name !== channel.tag) {
    requireMappable(document, target, tag, channel);
  }
  return tag;
}

/** Edits a channel; the transport fields are derived again when the tag or the module changes. */
export function updateChannel(
  document: IoDocument,
  moduleKey: string,
  tagName: string,
  request: UpdateIoChannelRequest,
  tags: readonly IoTag[],
): IoDocument {
  const source = requireModule(document, moduleKey);
  const channel = requireChannel(source, tagName);
  const target = targetModule(document, source, request);
  const moved = target.key !== source.key;
  const tag = tagToDerive(document, channel, target, moved, request, tags);
  const rules = rulesOf(target.transport);
  const others = { ...target, channels: target.channels.filter((other) => other !== channel) };
  const derived =
    tag === null
      ? channel
      : { ...channel, ...requireFields(rules.reshapeChannel(others, channel, tag, moved)) };
  const { tag: _tag, variable, comment, module: _module, ...transportPatch } = request;
  const edited: IoChannel = {
    tag: tag?.name ?? channel.tag,
    variable: variable ?? channel.variable,
    comment: comment ?? channel.comment,
    ...rules.patchChannel(derived, transportPatch),
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
