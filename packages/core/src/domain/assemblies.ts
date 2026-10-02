import type { Assembly, PantinDocument } from "@pantin/protocol";
import { makeUniqueId, slugifyDisplayName } from "./ids.ts";

// A new assembly for an import (ADR 0019 point 3). Its key comes from its
// display name once, unique among the Pantin's assemblies; renaming it later
// never changes the key, hence never the tags. It starts at the identity
// placement: a new import sits where its files put it (ADR 0033).
export function newAssembly(document: PantinDocument, name: string): Assembly {
  const takenKeys = new Set(document.assemblies.map((assembly) => assembly.key));
  return {
    key: makeUniqueId(slugifyDisplayName(name, "assembly"), takenKeys),
    name,
    placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
  };
}
