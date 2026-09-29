import type { z } from "zod";

// Document rules of assemblies (ADR 0019): unique keys, every body in a known
// assembly, and tag keys unique among the joints whose child body shares an
// assembly, since `<assembly>.<tagKey>` must name one joint only.

type DocumentShape = {
  assemblies: readonly { key: string }[];
  bodies: readonly { id: string; assembly: string }[];
  joints: readonly { id: string; child: string; tagKey: string }[];
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
}
