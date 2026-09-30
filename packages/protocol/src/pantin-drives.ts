import type { z } from "zod";

// Document rules of drives (ADR 0022 point 4, ADR 0028 point 9): unique ids
// and a known assembly. A drive moves no joint: what it feeds is checked with
// the actuators (pantin-actuators.ts). Tag prefixes are checked with those of
// joints and sensors (pantin-assemblies.ts).

type DocumentShape = {
  assemblies: readonly { key: string }[];
  drives: readonly { id: string; assembly: string }[];
};

function issue(context: z.RefinementCtx, path: (string | number)[], message: string): void {
  context.addIssue({ code: "custom", path: ["drives", ...path], message });
}

export function driveIssues(document: DocumentShape, context: z.RefinementCtx): void {
  const assemblies = new Set(document.assemblies.map((assembly) => assembly.key));
  const driveIds = new Set<string>();
  for (const [index, drive] of document.drives.entries()) {
    if (driveIds.has(drive.id)) {
      const message = `Drive id "${drive.id}" is used twice; drive ids must be unique.`;
      issue(context, [index, "id"], message);
    }
    driveIds.add(drive.id);
    if (!assemblies.has(drive.assembly)) {
      const message = `Drive "${drive.id}" is in assembly "${drive.assembly}", which does not exist.`;
      issue(context, [index, "assembly"], message);
    }
  }
}
