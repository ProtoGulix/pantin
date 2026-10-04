import type { Assembly, PantinDocument } from "@pantin/protocol";
import { assemblyChain, assemblySubtreeKeys, nextPickedAssembly } from "./assembly-tree.ts";
import { assemblyNodeId, bodyNodeId, parseNodeId } from "./tree/node-ids.ts";

// What the 3D view shows of assemblies (ADR 0019 point 13), as pure
// functions: which bodies the selection tints, which are hidden, and what a
// click selects. Display state only: never saved, never sent to the core.

export interface AssemblyDisplay {
  hiddenAssemblyKeys: ReadonlySet<string>;
  // The only assembly shown, or null when none is isolated.
  isolatedAssemblyKey: string | null;
}

export const NO_ASSEMBLY_DISPLAY: AssemblyDisplay = {
  hiddenAssemblyKeys: new Set(),
  isolatedAssemblyKey: null,
};

// The bodies of the assembly and of every assembly below it (ADR 0040).
function bodiesOf(document: PantinDocument, key: string): string[] {
  const keys = assemblySubtreeKeys(document.assemblies, key);
  return document.bodies.filter((body) => keys.has(body.assembly)).map((body) => body.id);
}

/** Bodies the selected node stands for: a body, or every body of an assembly's subtree. */
export function selectedBodyIds(document: PantinDocument, nodeId: string | null): Set<string> {
  const ref = nodeId === null ? null : parseNodeId(nodeId);
  if (ref?.kind === "body" || ref?.kind === "sourceNode") {
    return new Set([ref.bodyId]);
  }
  return new Set(ref?.kind === "assembly" ? bodiesOf(document, ref.key) : []);
}

/**
 * Hidden itself, or outside the isolated assembly's subtree. Hiding is stored
 * per assembly, one key for each assembly of the hidden subtree, so that a
 * sub-assembly can be shown again alone. Without `assemblies` the structure
 * tree is ignored (a flat Pantin).
 */
export function isAssemblyHidden(
  display: AssemblyDisplay,
  key: string,
  assemblies: readonly Assembly[] = [],
): boolean {
  const { hiddenAssemblyKeys, isolatedAssemblyKey } = display;
  if (isolatedAssemblyKey === null) {
    return hiddenAssemblyKeys.has(key);
  }
  return !(
    key === isolatedAssemblyKey || assemblyChain(assemblies, key).includes(isolatedAssemblyKey)
  );
}

export function hiddenBodyIds(document: PantinDocument, display: AssemblyDisplay): Set<string> {
  return new Set(
    document.bodies
      .filter((body) => isAssemblyHidden(display, body.assembly, document.assemblies))
      .map((body) => body.id),
  );
}

/**
 * What a click in the 3D view selects (ADR 0040 point 9): the top-level
 * assembly of the picked body; each double click goes one level down from the
 * selected assembly, down to the body. A click leaves a selected ancestor of
 * the body alone, since a double click is a click then a double click.
 */
export function pickedNodeId(
  document: PantinDocument,
  pantinId: string,
  bodyId: string,
  doubleClick: boolean,
  selectedNodeId: string | null,
): string {
  const assembly = document.bodies.find((body) => body.id === bodyId)?.assembly;
  if (assembly === undefined) {
    return bodyNodeId(pantinId, bodyId);
  }
  const selectedRef = selectedNodeId === null ? null : parseNodeId(selectedNodeId);
  const selectedKey = selectedRef?.kind === "assembly" ? selectedRef.key : null;
  const picked = nextPickedAssembly(
    assemblyChain(document.assemblies, assembly),
    selectedKey,
    doubleClick,
  );
  return picked === null ? bodyNodeId(pantinId, bodyId) : assemblyNodeId(pantinId, picked);
}

/**
 * Shows a hidden assembly or hides a shown one, with its whole subtree, as
 * seen on screen: an isolation in force becomes the equivalent hidden set
 * first, so the eye of the tree always matches the 3D view. Showing also
 * shows the ancestors, since a body cannot appear inside a hidden container.
 */
export function withAssemblyHiddenToggled(
  display: AssemblyDisplay,
  key: string,
  assemblies: readonly Assembly[],
): AssemblyDisplay {
  const hidden = new Set(
    assemblies
      .map((assembly) => assembly.key)
      .filter((candidate) => isAssemblyHidden(display, candidate, assemblies)),
  );
  const subtree = assemblySubtreeKeys(assemblies, key);
  if (hidden.has(key)) {
    for (const shown of [...subtree, ...assemblyChain(assemblies, key)]) {
      hidden.delete(shown);
    }
  } else {
    hidden.add(key);
    for (const covered of subtree) {
      hidden.add(covered);
    }
  }
  return { hiddenAssemblyKeys: hidden, isolatedAssemblyKey: null };
}

/** Isolating the isolated assembly again shows every assembly. */
export function withAssemblyIsolationToggled(
  display: AssemblyDisplay,
  key: string,
): AssemblyDisplay {
  return { ...display, isolatedAssemblyKey: display.isolatedAssemblyKey === key ? null : key };
}

/**
 * Deleted assemblies (one, or a subtree) leave no trace: isolating one would
 * hide every body.
 */
export function withAssemblyRemoved(
  display: AssemblyDisplay,
  keys: string | readonly string[],
): AssemblyDisplay {
  const removed = new Set(typeof keys === "string" ? [keys] : keys);
  const hiddenAssemblyKeys = new Set(
    [...display.hiddenAssemblyKeys].filter((key) => !removed.has(key)),
  );
  const isolatedAssemblyKey =
    display.isolatedAssemblyKey !== null && removed.has(display.isolatedAssemblyKey)
      ? null
      : display.isolatedAssemblyKey;
  return { hiddenAssemblyKeys, isolatedAssemblyKey };
}

/** A renamed assembly key keeps its display state (ADR 0019 point 13). */
export function withAssemblyKeyRenamed(
  display: AssemblyDisplay,
  from: string,
  to: string,
): AssemblyDisplay {
  const rename = (key: string) => (key === from ? to : key);
  return {
    hiddenAssemblyKeys: new Set([...display.hiddenAssemblyKeys].map(rename)),
    isolatedAssemblyKey:
      display.isolatedAssemblyKey === null ? null : rename(display.isolatedAssemblyKey),
  };
}
