import {
  describeEndpoint,
  endpointAssembly,
  endpointKey,
  type JointEndpoint,
} from "./joint-endpoint.ts";

// Document rules of the joint tree (ADR 0011 point 3, amended by ADR 0055
// points 3 and 4). The links are bodies and groups (assemblies moved by a
// joint). The core runs the same rules on the document an edit would produce,
// to answer with a conflict instead of a schema error.

export type JointTreeSource = {
  assemblies: readonly { key: string }[];
  bodies: readonly { id: string; assembly: string }[];
  joints: readonly { id: string; parent: JointEndpoint; child: JointEndpoint }[];
};

// The kind lets the core choose the answer: a missing endpoint is a bad
// request, the rules of ADR 0055 points 3 and 4 are conflicts with the document.
export type JointTreeIssueKind =
  | "unknown_endpoint"
  | "self_link"
  | "group_in_itself"
  | "body_child_between_assemblies"
  | "second_parent"
  | "cycle";

// jointIndex is null for a problem that is not about one joint.
export type JointTreeIssue = {
  jointIndex: number | null;
  kind: JointTreeIssueKind;
  message: string;
};

type Joint = JointTreeSource["joints"][number];
type Problem = Pick<JointTreeIssue, "kind" | "message">;

function unknownEndpointProblem(
  joint: Joint,
  assemblyOfBody: ReadonlyMap<string, string>,
  groupKeys: ReadonlySet<string>,
): Problem | undefined {
  for (const endpoint of [joint.parent, joint.child]) {
    if (endpoint.kind === "body" && !assemblyOfBody.has(endpoint.id)) {
      return {
        kind: "unknown_endpoint",
        message: `Joint "${joint.id}" references an unknown body "${endpoint.id}". Pick one of the bodies of this Pantin.`,
      };
    }
    if (endpoint.kind === "assembly" && !groupKeys.has(endpoint.key)) {
      return {
        kind: "unknown_endpoint",
        message: `Joint "${joint.id}" references an unknown group "${endpoint.key}". Pick one of the assemblies of this Pantin.`,
      };
    }
  }
  return undefined;
}

// The rules on the two ends of one joint, once both are known to exist.
function endpointsProblem(
  joint: Joint,
  assemblyOfBody: ReadonlyMap<string, string>,
): Problem | undefined {
  const { parent, child } = joint;
  if (endpointKey(parent) === endpointKey(child)) {
    return {
      kind: "self_link",
      message: `Joint "${joint.id}" cannot link ${describeEndpoint(child)} to itself. Pick two different ends.`,
    };
  }
  const parentAssembly = endpointAssembly(parent, assemblyOfBody);
  const childAssembly = endpointAssembly(child, assemblyOfBody);
  if (child.kind === "assembly" && parentAssembly === child.key) {
    return {
      kind: "group_in_itself",
      message: `Joint "${joint.id}" makes group "${child.key}" the child of ${describeEndpoint(parent)}, which is part of that group. A group cannot hang from itself: pick a parent outside it.`,
    };
  }
  if (child.kind === "body" && parentAssembly !== childAssembly) {
    return {
      kind: "body_child_between_assemblies",
      message: `Joint "${joint.id}" links ${describeEndpoint(parent)} to ${describeEndpoint(child)} of another assembly. The child of a joint between assemblies must be a group: use group "${childAssembly}" as the child.`,
    };
  }
  return undefined;
}

// A group with two parent joints is the anchor rule of ADR 0033 (reported by
// the assembly rules), so only bodies are checked here.
function secondParentProblem(
  joint: Joint,
  parentJointOfBody: Map<string, string>,
): Problem | undefined {
  if (joint.child.kind !== "body") {
    return undefined;
  }
  const first = parentJointOfBody.get(joint.child.id);
  if (first !== undefined) {
    return {
      kind: "second_parent",
      message: `Body "${joint.child.id}" already has the parent joint "${first}", so joint "${joint.id}" cannot be a second one; a body has at most one. Delete the first joint first.`,
    };
  }
  parentJointOfBody.set(joint.child.id, joint.id);
  return undefined;
}

// A cycle of bodies through their parent joints. A cycle through a group is
// a loop of anchors, which the assembly rules report with the joints that
// form it (ADR 0033 point 2): an unjointed body hangs from its group, so such
// a loop is a cycle of the link graph of ADR 0055 point 4 as well.
function cycleProblem(document: JointTreeSource): Problem | undefined {
  const parentOf = new Map<string, JointEndpoint>();
  for (const joint of document.joints) {
    if (joint.child.kind === "body" && !parentOf.has(joint.child.id)) {
      parentOf.set(joint.child.id, joint.parent);
    }
  }
  for (const start of parentOf.keys()) {
    const visited = new Set<string>();
    let current: JointEndpoint | undefined = { kind: "body", id: start };
    while (current?.kind === "body") {
      if (visited.has(current.id)) {
        return {
          kind: "cycle",
          message: `The joints form a cycle through ${describeEndpoint(current)}. Delete one joint of the cycle.`,
        };
      }
      visited.add(current.id);
      current = parentOf.get(current.id);
    }
  }
  return undefined;
}

/** Every broken rule, one issue per joint at most, then the cycle if no joint is at fault. */
export function jointTreeIssues(document: JointTreeSource): JointTreeIssue[] {
  const assemblyOfBody = new Map(document.bodies.map((body) => [body.id, body.assembly]));
  const groupKeys = new Set(document.assemblies.map((assembly) => assembly.key));
  const parentJointOfBody = new Map<string, string>();
  const issues: JointTreeIssue[] = [];
  for (const [jointIndex, joint] of document.joints.entries()) {
    const problem =
      unknownEndpointProblem(joint, assemblyOfBody, groupKeys) ??
      endpointsProblem(joint, assemblyOfBody) ??
      secondParentProblem(joint, parentJointOfBody);
    if (problem !== undefined) {
      issues.push({ jointIndex, ...problem });
    }
  }
  const cycle = issues.length === 0 ? cycleProblem(document) : undefined;
  return cycle === undefined ? issues : [{ jointIndex: null, ...cycle }];
}
