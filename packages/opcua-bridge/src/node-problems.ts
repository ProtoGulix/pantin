import type { NodeSignal } from "./module-plan.ts";
import { DATA_TYPE_BY_IEC_TYPE, type DataTypeName } from "./signal-values.ts";

// The node checks of ADR 0065 point 11, as a pure function of what the server said about one
// node. The messages say what to change; the caller puts the module in front of them.

const ACCESS_LEVEL_CURRENT_READ = 1;
const ACCESS_LEVEL_CURRENT_WRITE = 2;

/** What the server answered for one node. */
export type NodeObservation = {
  /** Null when the node does not exist, "other" for a type the bridge does not carry. */
  dataType: DataTypeName | "other" | null;
  userAccessLevel: number;
};

function typeProblem(signal: NodeSignal, observation: NodeObservation): string | undefined {
  const expected = DATA_TYPE_BY_IEC_TYPE[signal.iecType];
  if (observation.dataType === expected) {
    return undefined;
  }
  const found = observation.dataType === "other" ? "another type" : observation.dataType;
  return `Node ${signal.identifier} (tag ${signal.tag}) holds ${found} but its channel says ${signal.iecType}, which is ${expected}. Change the IEC type of the channel or the type of the variable in the PLC.`;
}

function accessProblem(signal: NodeSignal, observation: NodeObservation): string | undefined {
  const needed =
    signal.direction === "command" ? ACCESS_LEVEL_CURRENT_READ : ACCESS_LEVEL_CURRENT_WRITE;
  if ((observation.userAccessLevel & needed) !== 0) {
    return undefined;
  }
  return signal.direction === "command"
    ? `Node ${signal.identifier} (tag ${signal.tag}) is a command, so Pantin reads it, but the PLC does not let this user read it. Allow read access to the variable in the symbol configuration.`
    : `Node ${signal.identifier} (tag ${signal.tag}) is a feedback, so Pantin writes it, but the PLC does not let this user write it. Allow write access to the variable in the symbol configuration.`;
}

/** The problems of one node, none when it is as the mapping expects. */
export function nodeProblems(signal: NodeSignal, observation: NodeObservation): string[] {
  if (observation.dataType === null) {
    return [
      `Node ${signal.identifier} (tag ${signal.tag}) does not exist on the server. Check the node id prefix, the GVL name and that the variable is in the symbol configuration.`,
    ];
  }
  return [typeProblem(signal, observation), accessProblem(signal, observation)].filter(
    (problem): problem is string => problem !== undefined,
  );
}

/** The server's namespace table, as one line the user can copy a URI from. */
export function describeNamespaceArray(namespaceArray: readonly string[]): string {
  return namespaceArray.map((uri, index) => `[${index}] ${uri}`).join(", ");
}

export function unknownNamespaceProblem(
  namespaceUri: string,
  namespaceArray: readonly string[],
): string {
  return `The server has no namespace "${namespaceUri}". Its NamespaceArray is: ${describeNamespaceArray(namespaceArray)}. Copy the right URI into the module's namespace URI.`;
}
