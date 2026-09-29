import type { PantinDocument } from "@pantin/protocol";
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

function bodiesOf(document: PantinDocument, key: string): string[] {
  return document.bodies.filter((body) => body.assembly === key).map((body) => body.id);
}

/** Bodies the selected node stands for: a body, or every body of an assembly. */
export function selectedBodyIds(document: PantinDocument, nodeId: string | null): Set<string> {
  const ref = nodeId === null ? null : parseNodeId(nodeId);
  if (ref?.kind === "body" || ref?.kind === "sourceNode") {
    return new Set([ref.bodyId]);
  }
  return new Set(ref?.kind === "assembly" ? bodiesOf(document, ref.key) : []);
}

/** Hidden itself, or another assembly is isolated. */
export function isAssemblyHidden(display: AssemblyDisplay, key: string): boolean {
  const { hiddenAssemblyKeys, isolatedAssemblyKey } = display;
  return isolatedAssemblyKey === null ? hiddenAssemblyKeys.has(key) : key !== isolatedAssemblyKey;
}

export function hiddenBodyIds(document: PantinDocument, display: AssemblyDisplay): Set<string> {
  return new Set(
    document.bodies
      .filter((body) => isAssemblyHidden(display, body.assembly))
      .map((body) => body.id),
  );
}

/** A click selects the body's assembly, a double click the body itself. */
export function pickedNodeId(
  document: PantinDocument,
  pantinId: string,
  bodyId: string,
  doubleClick: boolean,
): string {
  const assembly = document.bodies.find((body) => body.id === bodyId)?.assembly;
  return doubleClick || assembly === undefined
    ? bodyNodeId(pantinId, bodyId)
    : assemblyNodeId(pantinId, assembly);
}

export function withAssemblyHiddenToggled(display: AssemblyDisplay, key: string): AssemblyDisplay {
  const hidden = new Set(display.hiddenAssemblyKeys);
  if (!hidden.delete(key)) {
    hidden.add(key);
  }
  return { ...display, hiddenAssemblyKeys: hidden };
}

/** Isolating the isolated assembly again shows every assembly. */
export function withAssemblyIsolationToggled(
  display: AssemblyDisplay,
  key: string,
): AssemblyDisplay {
  return { ...display, isolatedAssemblyKey: display.isolatedAssemblyKey === key ? null : key };
}

/** A deleted assembly leaves no trace: isolating it would hide every body. */
export function withAssemblyRemoved(display: AssemblyDisplay, key: string): AssemblyDisplay {
  const hiddenAssemblyKeys = new Set(display.hiddenAssemblyKeys);
  hiddenAssemblyKeys.delete(key);
  const isolatedAssemblyKey =
    display.isolatedAssemblyKey === key ? null : display.isolatedAssemblyKey;
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
