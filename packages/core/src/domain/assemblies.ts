import type { Assembly, PantinDocument } from "@pantin/protocol";
import { makeUniqueId, slugifyDisplayName } from "./ids.ts";

// A new assembly for an import (ADR 0019 point 3). Its key comes from its
// display name once, unique among the Pantin's assemblies; renaming it later
// never changes the key, hence never the tags.
export function newAssembly(document: PantinDocument, name: string): Assembly {
  const takenKeys = new Set(document.assemblies.map((assembly) => assembly.key));
  return { key: makeUniqueId(slugifyDisplayName(name, "assembly"), takenKeys), name };
}
