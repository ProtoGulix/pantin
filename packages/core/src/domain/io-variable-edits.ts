import type {
  IoChannel,
  IoDocument,
  IoVariableAssignment,
  SkippedAssignment,
} from "@pantin/protocol";
import { variableProblemOf } from "./io-identifiers.ts";

// Setting the PLC variable of many channels at once (ADR 0064 point 13): the batch
// behind a symbol import. Pure. Each entry is checked again, because the client
// worked from a preview that may be older than the open mapping: one that fails is
// skipped with a reason and the others still apply.

export interface VariableOutcome {
  document: IoDocument;
  applied: IoVariableAssignment[];
  skipped: SkippedAssignment[];
}

interface Pending {
  assignment: IoVariableAssignment;
  channel: IoChannel;
  previousVariable: string;
}

function findChannel(
  modules: IoDocument["modules"],
  assignment: IoVariableAssignment,
): IoChannel | string {
  const module = modules.find((candidate) => candidate.key === assignment.module);
  if (module === undefined) {
    return `The mapping has no module "${assignment.module}".`;
  }
  const channel = module.channels.find((candidate) => candidate.tag === assignment.tag);
  return (
    channel ?? `Tag "${assignment.tag}" is not mapped in module "${assignment.module}" any more.`
  );
}

// The tags that hold each variable (ignoring case) in the current state of the copy.
function tagsByVariable(modules: IoDocument["modules"]): Map<string, Set<string>> {
  const holders = new Map<string, Set<string>>();
  for (const channel of modules.flatMap((module) => module.channels)) {
    const key = channel.variable.toLowerCase();
    const tags = holders.get(key) ?? new Set<string>();
    tags.add(channel.tag);
    holders.set(key, tags);
  }
  return holders;
}

// Two tags on one variable would be one PLC variable doing two jobs; the same tag in
// two modules is one signal and may share its variable (ADR 0064 point 5). The check is
// on the final state of the batch, so two signals may swap their variables.
function dropConflicts(modules: IoDocument["modules"], pending: Pending[]): SkippedAssignment[] {
  const skipped: SkippedAssignment[] = [];
  let remaining = pending;
  for (;;) {
    const holders = tagsByVariable(modules);
    const conflicting = remaining.filter(
      (entry) => (holders.get(entry.assignment.variable.toLowerCase())?.size ?? 0) > 1,
    );
    if (conflicting.length === 0) {
      return skipped;
    }
    for (const entry of conflicting) {
      const other = [...(holders.get(entry.assignment.variable.toLowerCase()) ?? [])].find(
        (tag) => tag !== entry.assignment.tag,
      );
      skipped.push({
        ...entry.assignment,
        reason: `Variable "${entry.assignment.variable}" would be the variable of "${other}" too: one PLC variable carries one signal.`,
      });
      // Putting the old name back may clash in turn: the loop checks again.
      entry.channel.variable = entry.previousVariable;
    }
    remaining = remaining.filter((entry) => !conflicting.includes(entry));
  }
}

function repeatedChannel(pending: readonly Pending[], channel: IoChannel): string | null {
  return pending.some((entry) => entry.channel === channel)
    ? "The batch assigns this channel twice: only the first entry counts."
    : null;
}

/** Applies the assignments to a copy of the document. */
export function applyVariableAssignments(
  document: IoDocument,
  assignments: readonly IoVariableAssignment[],
): VariableOutcome {
  // The copy is edited in place: the document the caller holds never changes.
  const modules = document.modules.map((module) => ({
    ...module,
    channels: module.channels.map((channel) => ({ ...channel })),
  }));
  const skipped: SkippedAssignment[] = [];
  const pending: Pending[] = [];
  for (const assignment of assignments) {
    const found = findChannel(modules, assignment);
    const refusal =
      typeof found === "string"
        ? found
        : (variableProblemOf(assignment.variable) ?? repeatedChannel(pending, found));
    if (typeof found === "string" || refusal !== null) {
      skipped.push({ ...assignment, reason: refusal ?? "" });
    } else {
      pending.push({ assignment, channel: found, previousVariable: found.variable });
      found.variable = assignment.variable;
    }
  }
  const refused = dropConflicts(modules, pending);
  const isRefused = (assignment: IoVariableAssignment) =>
    refused.some((entry) => entry.module === assignment.module && entry.tag === assignment.tag);
  return {
    document: { ...document, modules },
    applied: pending.map((entry) => entry.assignment).filter((entry) => !isRefused(entry)),
    skipped: [...skipped, ...refused],
  };
}
