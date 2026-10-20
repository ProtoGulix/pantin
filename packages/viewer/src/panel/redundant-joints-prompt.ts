import type { KeptJoint, RedundantJointsList } from "@pantin/protocol";
import { pluralKey, type Translate } from "../i18n/translate.ts";
import type { PromptSection } from "./prompt-section.ts";

// What the redundant fixed joints prompt shows (ADR 0060 point 5). The core
// decided what is redundant and why a joint stays: this only words it.
// Headings carry a count and a text, so the sections never rely on colour.

/** The question, with the count of joints that would be deleted. */
export function redundantJointsText(
  list: RedundantJointsList,
  language: Parameters<typeof pluralKey>[2],
  t: Translate,
): string {
  const count = list.redundant.length;
  return t(pluralKey("prompt.redundantJoints.text", count, language), { count });
}

// Grouped by key: names are not unique, two assemblies may share one.
function linesByAssembly(list: RedundantJointsList, t: Translate): string[] {
  const groups = new Map<string, { assembly: string; names: string[] }>();
  for (const joint of list.redundant) {
    const group = groups.get(joint.assembly.key);
    if (group === undefined) {
      groups.set(joint.assembly.key, { assembly: joint.assembly.name, names: [joint.name] });
    } else {
      group.names.push(joint.name);
    }
  }
  return [...groups.values()].map(({ assembly, names }) =>
    t("prompt.redundantJoints.assemblyLine", { assembly, names: names.join(", ") }),
  );
}

function keptLine(joint: KeptJoint, t: Translate): string {
  const key =
    joint.reason === "moving_parent"
      ? "prompt.redundantJoints.movingParent"
      : "prompt.redundantJoints.inUse";
  return t(key, { joint: joint.name, by: joint.by.name });
}

/** "À supprimer (n)" always, "Conservées (n)" only when the core kept some. */
export function redundantJointsSections(list: RedundantJointsList, t: Translate): PromptSection[] {
  const sections: PromptSection[] = [
    {
      heading: t("prompt.redundantJoints.toDelete", { count: list.redundant.length }),
      lines: linesByAssembly(list, t),
    },
  ];
  if (list.kept.length > 0) {
    sections.push({
      heading: t("prompt.redundantJoints.kept", { count: list.kept.length }),
      lines: list.kept.map((joint) => keptLine(joint, t)),
    });
  }
  return sections;
}
