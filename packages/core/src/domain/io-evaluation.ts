import type {
  IoDocument,
  IoMappedChannel,
  IoMappingResponse,
  IoProblem,
  PantinDocument,
  TransportKind,
} from "@pantin/protocol";
import { type IoReading, mappingIdOf } from "./io-document-text.ts";
import { projectMapping } from "./io-projection.ts";
import { rulesOf } from "./io-transports.ts";
import { type IoTag, validateIoDocument } from "./io-validation.ts";
import { type TagOwner, tagEntries } from "./tag-entries.ts";

// From the open mapping and the document's tags to the answer of GET .../io
// (ADR 0049 points 5 to 7): pure.

function ownerOf(owner: TagOwner): IoTag["owner"] {
  switch (owner.kind) {
    case "joint":
      return { kind: "joint", id: owner.joint.id };
    case "drive":
      return { kind: "drive", id: owner.drive.id };
    case "sensor":
      return { kind: "sensor", id: owner.sensor.id };
    case "emitter":
      return { kind: "emitter", id: owner.emitter.id };
    case "presenceSensor":
      return { kind: "presenceSensor", id: owner.presenceSensor.id };
  }
}

/** The tags a mapping can refer to: those of the open document. */
export function ioTagsOf(document: PantinDocument): IoTag[] {
  return tagEntries(document).map((entry) => ({
    name: entry.name,
    type: entry.type,
    direction: entry.direction,
    owner: ownerOf(entry.owner),
  }));
}

function annotated(document: IoDocument, tags: readonly IoTag[]): IoMappingResponse["modules"] {
  const byName = new Map(tags.map((tag) => [tag.name, tag]));
  return document.modules.map((module) => ({
    ...module,
    channels: module.channels.map((channel): IoMappedChannel => {
      const tag = byName.get(channel.tag);
      // The transport's resolved sub-object replaces the file's, which it extends.
      const { opcua: _file, ...common } = channel;
      return {
        ...common,
        ...rulesOf(module.transport).resolvedChannelFields(module.transport, channel),
        tagType: tag?.type ?? null,
        direction: tag?.direction ?? null,
        owner: tag?.owner ?? null,
      };
    }),
  }));
}

function unmappedAll(tags: readonly IoTag[]): IoMappingResponse["unmappedTags"] {
  return tags.map(({ name, type, direction, owner }) => ({ name, type, direction, owner }));
}

function statusOf(problems: readonly IoProblem[]): IoMappingResponse["status"] {
  return problems.length === 0 ? "valid" : "invalid";
}

function evaluateWholeMapping(reading: IoReading, tags: readonly IoTag[]): IoMappingResponse {
  if (reading.kind === "missing") {
    return {
      status: "missing",
      mappingId: null,
      modules: [],
      problems: [],
      unmappedTags: unmappedAll(tags),
    };
  }
  if (reading.kind === "unreadable") {
    return {
      status: "invalid",
      mappingId: null,
      modules: [],
      problems: reading.problems,
      unmappedTags: unmappedAll(tags),
    };
  }
  const validation = validateIoDocument(reading.document, tags);
  return {
    status: statusOf(validation.problems),
    mappingId: mappingIdOf(reading),
    modules: annotated(reading.document, tags),
    problems: validation.problems,
    unmappedTags: validation.unmappedTags,
  };
}

/**
 * Checks the open mapping against the tags of the open document. With a `transport`, the
 * answer is the projection on that kind (ADR 0065 point 7).
 */
export function evaluateIoMapping(
  reading: IoReading,
  tags: readonly IoTag[],
  transport?: TransportKind,
): IoMappingResponse {
  const whole = evaluateWholeMapping(reading, tags);
  return transport === undefined ? whole : projectMapping(whole, reading, tags, transport);
}
