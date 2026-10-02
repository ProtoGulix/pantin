import type { z } from "zod";

// Document rules of assemblies (ADR 0019): unique keys, every body in a known
// assembly, and tag prefixes `<assembly>.<tagKey>` unique among joints (in
// their child's assembly), drives (in their own, ADR 0022) and sensors (in
// their own, ADR 0023), since a prefix must name one tag owner only. Also the
// anchor rules of ADR 0033: an assembly has at most one incoming joint between
// assemblies and anchors form a forest. The core derives the anchors again
// for pose computation (core/domain/assembly-anchors.ts); this module only
// refuses documents where that derivation would be ambiguous.

type DocumentShape = {
  assemblies: readonly { key: string }[];
  bodies: readonly { id: string; assembly: string }[];
  joints: readonly { id: string; parent: string; child: string; tagKey: string }[];
  drives: readonly { id: string; assembly: string; tagKey: string }[];
  sensors: readonly { id: string; assembly: string; tagKey: string }[];
};

export function assemblyIssues(document: DocumentShape, context: z.RefinementCtx): void {
  const keys = new Set<string>();
  for (const [index, assembly] of document.assemblies.entries()) {
    if (keys.has(assembly.key)) {
      context.addIssue({
        code: "custom",
        path: ["assemblies", index, "key"],
        message: `Assembly key "${assembly.key}" is used twice; assembly keys must be unique.`,
      });
    }
    keys.add(assembly.key);
  }
  for (const [index, body] of document.bodies.entries()) {
    if (!keys.has(body.assembly)) {
      context.addIssue({
        code: "custom",
        path: ["bodies", index, "assembly"],
        message: `Body "${body.id}" is in assembly "${body.assembly}", which does not exist.`,
      });
    }
  }
  tagKeyIssues(document, context);
  anchorIssues(document, context);
}

type Anchor = { assembly: string; jointId: string };

// A joint to an unknown body is reported by the joint tree rules, so it is
// skipped here.
function anchorIssues(document: DocumentShape, context: z.RefinementCtx): void {
  const assemblyOf = new Map(document.bodies.map((body) => [body.id, body.assembly]));
  const anchorOf = new Map<string, Anchor>();
  for (const [index, joint] of document.joints.entries()) {
    const parentAssembly = assemblyOf.get(joint.parent);
    const childAssembly = assemblyOf.get(joint.child);
    if (
      parentAssembly === undefined ||
      childAssembly === undefined ||
      parentAssembly === childAssembly
    ) {
      continue;
    }
    const first = anchorOf.get(childAssembly);
    if (first === undefined) {
      anchorOf.set(childAssembly, { assembly: parentAssembly, jointId: joint.id });
      continue;
    }
    context.addIssue({
      code: "custom",
      path: ["joints", index],
      message: `Assembly "${childAssembly}" is anchored twice: by joint "${first.jointId}" and joint "${joint.id}".`,
    });
  }
  loopIssue(anchorOf, context);
}

// Follows the anchors up from each assembly; the first revisited assembly
// closes a loop, which is reported once with the joints that form it.
function loopIssue(anchorOf: ReadonlyMap<string, Anchor>, context: z.RefinementCtx): void {
  for (const start of anchorOf.keys()) {
    const path: string[] = [];
    let current: string | undefined = start;
    while (current !== undefined) {
      const loopStart = path.indexOf(current);
      if (loopStart >= 0) {
        const joints = path
          .slice(loopStart)
          .map((assembly) => `"${anchorOf.get(assembly)?.jointId}"`);
        context.addIssue({
          code: "custom",
          path: ["joints"],
          message: `The joints between assemblies form a loop of anchors through assembly "${current}": joints ${joints.join(", ")}.`,
        });
        return;
      }
      path.push(current);
      current = anchorOf.get(current)?.assembly;
    }
  }
}

function tagKeyIssues(document: DocumentShape, context: z.RefinementCtx): void {
  const assemblyOf = new Map(document.bodies.map((body) => [body.id, body.assembly]));
  const seen = new Set<string>();
  for (const [index, joint] of document.joints.entries()) {
    const assembly = assemblyOf.get(joint.child);
    // A joint to an unknown body is reported by the joint tree rules.
    if (assembly === undefined) {
      continue;
    }
    const tagPrefix = `${assembly}.${joint.tagKey}`;
    if (seen.has(tagPrefix)) {
      context.addIssue({
        code: "custom",
        path: ["joints", index, "tagKey"],
        message: `Tag key "${joint.tagKey}" of joint "${joint.id}" is already used in assembly "${assembly}".`,
      });
    }
    seen.add(tagPrefix);
  }
  const owners = [
    { list: "drives", label: "drive", items: document.drives },
    { list: "sensors", label: "sensor", items: document.sensors },
  ] as const;
  for (const { list, label, items } of owners) {
    for (const [index, owner] of items.entries()) {
      const tagPrefix = `${owner.assembly}.${owner.tagKey}`;
      if (seen.has(tagPrefix)) {
        context.addIssue({
          code: "custom",
          path: [list, index, "tagKey"],
          message: `Tag key "${owner.tagKey}" of ${label} "${owner.id}" is already used in assembly "${owner.assembly}".`,
        });
      }
      seen.add(tagPrefix);
    }
  }
}
