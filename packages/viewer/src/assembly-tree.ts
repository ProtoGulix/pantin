import type { Assembly } from "@pantin/protocol";

// The structure tree of assemblies (ADR 0040), as pure functions over the
// `parent` keys. Product structure only: poses never read it.

type AssemblyLinks = readonly Pick<Assembly, "key" | "parent">[];

/**
 * The keys from the top-level assembly down to `key`, both included. Empty
 * for an unknown key. A parent loop or unknown parent (refused by the
 * validator) ends the chain instead of looping.
 */
export function assemblyChain(assemblies: AssemblyLinks, key: string): string[] {
  const chain: string[] = [];
  let current: string | undefined = key;
  while (current !== undefined && !chain.includes(current)) {
    const found: AssemblyLinks[number] | undefined = assemblies.find(
      (candidate) => candidate.key === current,
    );
    if (found === undefined) {
      break;
    }
    chain.unshift(found.key);
    current = found.parent;
  }
  return chain;
}

/** The assembly and every assembly below it. */
export function assemblySubtreeKeys(assemblies: AssemblyLinks, key: string): Set<string> {
  return new Set(
    assemblies
      .filter((candidate) => assemblyChain(assemblies, candidate.key).includes(key))
      .map((candidate) => candidate.key),
  );
}

/** The direct sub-assemblies of `parentKey`, or the top-level ones for undefined. */
export function childAssemblies<Item extends AssemblyLinks[number]>(
  assemblies: readonly Item[],
  parentKey: string | undefined,
): Item[] {
  const keys = new Set(assemblies.map((assembly) => assembly.key));
  return assemblies.filter((assembly) =>
    parentKey === undefined
      ? // An unknown parent is shown at top level rather than lost.
        assembly.parent === undefined || !keys.has(assembly.parent)
      : assembly.parent === parentKey,
  );
}

/**
 * What a click in the 3D view selects. `bodyChain` is the chain of the
 * picked body's assembly. A first click, or one when the selected assembly is
 * not on the chain, selects the top-level assembly; a double click goes one
 * level down from the selected assembly, then to the body (null).
 */
export function nextPickedAssembly(
  bodyChain: readonly string[],
  selectedAssemblyKey: string | null,
  doubleClick: boolean,
): string | null {
  const selectedIndex = selectedAssemblyKey === null ? -1 : bodyChain.indexOf(selectedAssemblyKey);
  if (selectedIndex === -1) {
    return bodyChain[0] ?? null;
  }
  return doubleClick ? (bodyChain[selectedIndex + 1] ?? null) : (bodyChain[selectedIndex] ?? null);
}
