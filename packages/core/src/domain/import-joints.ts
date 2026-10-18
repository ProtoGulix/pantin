import {
  type Body,
  bodyEndpoint,
  groupEndpoint,
  type Joint,
  type PantinDocument,
} from "@pantin/protocol";
import { addJointToDocument } from "./joint-rules.ts";

const NO_POSITIONS: ReadonlyMap<string, number> = new Map();

// Fixed joints that keep the bodies of one import together (ADR 0017,
// ADR 0040 point 3), in the order given, each named after its child. A link
// to a body of another assembly hangs that assembly: the child is the group
// (ADR 0055 point 3), the bodies of the group keep their star of joints until
// the import drops it. The
// bodies and their assemblies must already be in the document. Placements
// are identity and joints fixed, so no displayed position is read.
export function addFixedJoints(
  document: PantinDocument,
  links: readonly { parent: Body; child: Body }[],
): { document: PantinDocument; joints: Joint[] } {
  const joints: Joint[] = [];
  let current = document;
  for (const { parent, child } of links) {
    // A fixed joint never moves: origin and axis are only there because the
    // schema requires them for every joint.
    const added = addJointToDocument(
      current,
      {
        type: "fixed",
        name: child.name,
        parent: bodyEndpoint(parent.id),
        child:
          child.assembly === parent.assembly
            ? bodyEndpoint(child.id)
            : groupEndpoint(child.assembly),
        origin: [0, 0, 0],
        axis: [0, 0, 1],
      },
      NO_POSITIONS,
    );
    current = added.document;
    joints.push(added.joint);
  }
  return { document: current, joints };
}
