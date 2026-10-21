import { deriveVariable, VARIABLE_MAX_LENGTH } from "./io-identifiers.ts";

// What the core proposes when a module or a channel is created (ADR 0049
// point 4), whatever the transport: pure, shared with the CLI so that
// `pantin io init` and the editor allocate the same way. What depends on the
// transport (ports, zones, addresses) is in @pantin/transport-types.

/** The smallest `m<n>` (n from 1) that no module uses. */
export function nextModuleKey(usedKeys: readonly string[]): string {
  const used = new Set(usedKeys);
  let number = 1;
  while (used.has(`m${number}`)) {
    number += 1;
  }
  return `m${number}`;
}

/**
 * The CODESYS variable of a tag that no variable of `takenVariables` equals,
 * ignoring case: `_2`, `_3` and so on are appended, the base shortened so the
 * whole stays within 64 characters.
 */
export function allocateVariable(tagName: string, takenVariables: readonly string[]): string {
  const taken = new Set(takenVariables.map((variable) => variable.toLowerCase()));
  const base = deriveVariable(tagName);
  if (!taken.has(base.toLowerCase())) {
    return base;
  }
  for (let suffixNumber = 2; ; suffixNumber += 1) {
    const suffix = `_${suffixNumber}`;
    // A trailing "_" left by the cut would make a double underscore, which
    // CODESYS refuses.
    const cut = base.slice(0, VARIABLE_MAX_LENGTH - suffix.length).replace(/_+$/, "");
    const candidate = `${cut}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}
