import type { IoUnmappedTag } from "@pantin/protocol";

// Unmapped tags grouped by assembly for the side list (ADR 0049 point 11).

export interface UnmappedGroup {
  assemblyKey: string;
  // The assembly's display name, or its key when the document has none.
  assemblyName: string;
  tags: readonly IoUnmappedTag[];
}

// A tag name is "<assembly key>.<tag key>.<member>" and keys hold no dot
// (protocol tag.ts), so the first segment is the assembly key.
export function assemblyKeyOfTag(tagName: string): string {
  return tagName.split(".")[0] ?? tagName;
}

export function groupUnmappedTags(
  tags: readonly IoUnmappedTag[],
  assemblyNames: ReadonlyMap<string, string>,
): UnmappedGroup[] {
  const groups = new Map<string, IoUnmappedTag[]>();
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
