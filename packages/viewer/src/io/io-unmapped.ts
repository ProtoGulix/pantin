import type { IoMappingResponse, IoUnmappedTag } from "@pantin/protocol";

// The tags a module can take, grouped by assembly for the side list (ADR 0049 point 11, ADR 0064
// point 14).

// A tag offered to a module. `alsoIn` names the other modules that already map it: only a feedback
// can be in several, so it is empty for a tag that no module maps.
export interface IoOfferedTag extends IoUnmappedTag {
  alsoIn: readonly string[];
}

export interface UnmappedGroup {
  assemblyKey: string;
  // The assembly's display name, or its key when the document has none.
  assemblyName: string;
  tags: readonly IoOfferedTag[];
}

// A tag name is "<assembly key>.<tag key>.<member>" and keys hold no dot
// (protocol tag.ts), so the first segment is the assembly key.
export function assemblyKeyOfTag(tagName: string): string {
  return tagName.split(".")[0] ?? tagName;
}

/** The tags "Map all" sends: those no module maps. A feedback in another module is chosen one by one. */
export function mapAllTagNames(groups: readonly UnmappedGroup[]): string[] {
  return groups.flatMap((group) =>
    group.tags.filter((tag) => tag.alsoIn.length === 0).map((tag) => tag.name),
  );
}

/**
 * What can be mapped to a module: the tags no module maps, and the feedbacks that other modules
 * map but this one does not. A command mapped anywhere is not offered (one module drives it).
 */
export function offeredTagsFor(
  mapping: IoMappingResponse,
  moduleKey: string | null,
): IoOfferedTag[] {
  const here = new Set(
    mapping.modules.find((module) => module.key === moduleKey)?.channels.map((c) => c.tag),
  );
  const elsewhere = new Map<string, IoOfferedTag>();
  for (const module of mapping.modules) {
    for (const channel of module.channels) {
      const { tagType, direction, owner } = channel;
      if (module.key === moduleKey || here.has(channel.tag)) {
        continue;
      }
      if (direction !== "feedback" || tagType === null || owner === null) {
        continue;
      }
      const known = elsewhere.get(channel.tag);
      elsewhere.set(channel.tag, {
        name: channel.tag,
        type: tagType,
        direction,
        owner,
        alsoIn: [...(known?.alsoIn ?? []), module.key],
      });
    }
  }
  return [...mapping.unmappedTags.map((tag) => ({ ...tag, alsoIn: [] })), ...elsewhere.values()];
}

export function groupUnmappedTags(
  tags: readonly IoOfferedTag[],
  assemblyNames: ReadonlyMap<string, string>,
): UnmappedGroup[] {
  const groups = new Map<string, IoOfferedTag[]>();
  for (const tag of tags) {
    const key = assemblyKeyOfTag(tag.name);
    groups.set(key, [...(groups.get(key) ?? []), tag]);
  }
  return [...groups.entries()]
    .map(([assemblyKey, grouped]) => ({
      assemblyKey,
      assemblyName: assemblyNames.get(assemblyKey) ?? assemblyKey,
      tags: grouped,
    }))
    .sort((left, right) => left.assemblyKey.localeCompare(right.assemblyKey));
}
