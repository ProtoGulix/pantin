import type { Body, Joint, PantinDocument } from "@pantin/protocol";
import { addJointToDocument } from "./joint-rules.ts";

const NO_POSITIONS: ReadonlyMap<string, number> = new Map();

// Fixed joints that keep the bodies of one import together (ADR 0017): the
// first body is the root, every other body is its child. Moving the root
// then moves the whole import. The bodies must already be in the document.
// Joints inside one fresh assembly anchor nothing, so no position is read.
// One body gives no joint, which is always the case for GLB and STL.
export function addStarJoints(
  document: PantinDocument,
  bodies: readonly Body[],
): { document: PantinDocument; joints: Joint[] } {
  const [root, ...children] = bodies;
  const joints: Joint[] = [];
  let current = document;
  if (root === undefined) {
    return { document: current, joints };
  }
  for (const child of children) {
    // A fixed joint never moves: origin and axis are only there because the
    // schema requires them for every joint.
    const added = addJointToDocument(
      current,
      {
        type: "fixed",
        name: child.name,
        parent: root.id,
        child: child.id,
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
