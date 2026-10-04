import type { Assembly, PantinDocument } from "@pantin/protocol";
import { makeUniqueId, slugifyDisplayName } from "./ids.ts";
import { addAssembly } from "./pantin-document.ts";

// A new assembly for an import (ADR 0019 point 3). Its key comes from its
// display name once, unique among the Pantin's assemblies; renaming it later
// never changes the key, hence never the tags. `parent` is the key of the
// assembly that contains it (ADR 0040). It starts at the identity
// placement: a new import sits where its files put it (ADR 0033).
export function newAssembly(document: PantinDocument, name: string, parent?: string): Assembly {
  const takenKeys = new Set(document.assemblies.map((assembly) => assembly.key));
  return {
    key: makeUniqueId(slugifyDisplayName(name, "assembly"), takenKeys),
    name,
    placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
    ...(parent === undefined ? {} : { parent }),
  };
}

// The assemblies of one import, in the order given: a parent comes before its
// children, `parent` being an index into the list. Each key counts the keys
// of the assemblies built before it as taken (ADR 0040 point 5).
export function newAssemblyTree(
  document: PantinDocument,
  wanted: readonly { name: string; parent: number | undefined }[],
): Assembly[] {
  const created: Assembly[] = [];
  let current = document;
  for (const { name, parent } of wanted) {
    const parentKey = parent === undefined ? undefined : created[parent]?.key;
    const assembly = newAssembly(current, name, parentKey);
    created.push(assembly);
    current = addAssembly(current, assembly);
  }
  return created;
}
