import type { IoMappingResponse, IoTagOwner } from "@pantin/protocol";
import { cellIdOf } from "./io-problems.ts";

// The tags of one element (a device or a joint) with their mapping, read from
// the core's answer alone: the viewer never works out which tags an element
// owns, the core says it with `owner` (ADR 0049 point 11).

export interface ElementTag {
  name: string;
  // Null when no channel maps the tag.
  channel: {
    moduleKey: string;
    zone: string;
    address: number;
    variable: string;
    // The id of the tag cell in the I/O view, to scroll to.
    cellId: string;
  } | null;
}

const sameOwner = (left: IoTagOwner | null, right: IoTagOwner): boolean =>
  left !== null && left.kind === right.kind && left.id === right.id;

/** Mapped tags in module order, then unmapped ones in the core's order. */
export function tagsOfOwner(mapping: IoMappingResponse | null, owner: IoTagOwner): ElementTag[] {
  if (mapping === null) {
    return [];
  }
  const mapped = mapping.modules.flatMap((module, moduleIndex) =>
    module.channels.flatMap((channel, channelIndex) =>
      sameOwner(channel.owner, owner)
        ? [
            {
              name: channel.tag,
              channel: {
                moduleKey: module.key,
                zone: channel.zone,
                address: channel.address,
                variable: channel.variable,
                cellId: cellIdOf({ moduleIndex, channelIndex, field: "tag" }),
              },
            },
          ]
        : [],
    ),
  );
  const unmapped = mapping.unmappedTags
    .filter((tag) => sameOwner(tag.owner, owner))
    .map((tag) => ({ name: tag.name, channel: null }));
  return [...mapped, ...unmapped];
}

/** The id of an unmapped tag's entry in the side list, where a link lands. */
export function unmappedEntryId(tagName: string): string {
  return `io-unmapped-${tagName}`;
}

export interface TagPlace {
  // Null for an unmapped tag, which belongs to no module.
  moduleKey: string | null;
  cellId: string;
}

/** Where the I/O view shows a tag: its channel's tag cell, or its entry in the unmapped list. */
export function placeOfTag(tags: readonly ElementTag[], name: string): TagPlace | null {
  const found = tags.find((tag) => tag.name === name);
  if (found === undefined) {
    return null;
  }
  return found.channel === null
    ? { moduleKey: null, cellId: unmappedEntryId(name) }
    : { moduleKey: found.channel.moduleKey, cellId: found.channel.cellId };
}

/** The first mapped tag, else the first unmapped one: where "Show in I/O" lands. */
export function firstPlace(tags: readonly ElementTag[]): TagPlace | null {
  const first = tags.find((tag) => tag.channel !== null) ?? tags[0];
  return first === undefined ? null : placeOfTag(tags, first.name);
}
