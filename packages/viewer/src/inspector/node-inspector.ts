import { nodeGroups, type PropertySource } from "../properties/properties-model.ts";
import { parseNodeId } from "../tree/node-ids.ts";
import { buildTree, findNode } from "../tree/tree-model.ts";
import { type InspectorContent, type InspectorContext, NOTHING } from "./inspector-context.ts";
import { jointInspectorGroups } from "./joint-inspector.ts";
import { emptyFamilyHints, scopeIndexGroups } from "./scope-index.ts";

// The inspector of a tree node (ADR 0030 point 2): its properties first, as
// the tree's grid used to show them, then the groups that are live or that
// index devices: the devices of the Pantin or of an assembly, the position,
// fault and links of a joint. A body, a folder and a source node have their
// properties only.

function withIndex(
  base: InspectorContent,
  context: InspectorContext,
  assemblyKey: string | null,
): InspectorContent {
  const index = scopeIndexGroups(context, assemblyKey);
  return { ...base, groups: [...base.groups, ...index], hints: emptyFamilyHints(index) };
}

export function nodeInspectorContent(
  source: PropertySource,
  nodeId: string,
  context: InspectorContext,
): InspectorContent {
  const { pantin, t } = context;
  const ref = parseNodeId(nodeId);
  const groups = nodeGroups(source, nodeId, t);
  if (ref === null || ref.pantinId !== pantin.id || groups.length === 0) {
    return NOTHING;
  }
  const { document } = pantin;
  // Named by the document where it has the name; folders and source nodes have only the tree's label.
  const documentName =
    ref.kind === "assembly"
      ? document.assemblies.find((assembly) => assembly.key === ref.key)?.name
      : ref.kind === "body"
        ? document.bodies.find((body) => body.id === ref.bodyId)?.name
        : undefined;
  const subject = documentName ?? findNode(buildTree(source, t), nodeId)?.label ?? null;
  const base = { subject, groups, hints: [] };
  switch (ref.kind) {
    case "pantin":
      return withIndex({ ...base, subject: document.name }, context, null);
    case "assembly":
      return withIndex(base, context, ref.key);
    case "joint": {
      const joint = pantin.document.joints.find((candidate) => candidate.id === ref.jointId);
      return joint === undefined
        ? NOTHING
        : {
            subject: `${t("diagram.kind.joint")} · ${joint.name}`,
            groups: [...groups, ...jointInspectorGroups(joint, context)],
            hints: [],
          };
    }
    default:
      return base;
  }
}
