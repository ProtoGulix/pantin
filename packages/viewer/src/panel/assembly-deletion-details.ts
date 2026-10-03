import type { AssemblyDeletion } from "@pantin/protocol";
import type { MessageKey, Translate } from "../i18n/translate.ts";

// The lines under "delete the assembly and all its contents" (ADR 0037
// point 7): one per non-empty group, display names only, never an id.

interface Group {
  key: MessageKey;
  names: readonly string[];
}

function groupLine(group: Group, t: Translate): string | null {
  return group.names.length === 0
    ? null
    : t(group.key, { count: group.names.length, names: group.names.join(", ") });
}

export function assemblyDeletionDetails(deletion: AssemblyDeletion, t: Translate): string[] {
  const names = (items: readonly { name: string }[]) => items.map(({ name }) => name);
  const groups: Group[] = [
    { key: "prompt.deleteAssembly.bodies", names: names(deletion.bodies) },
    {
      key: "prompt.deleteAssembly.joints",
      names: names(deletion.joints.filter((joint) => !joint.betweenAssemblies)),
    },
    {
      key: "prompt.deleteAssembly.jointsBetween",
      names: names(deletion.joints.filter((joint) => joint.betweenAssemblies)),
    },
    { key: "prompt.deleteAssembly.drives", names: names(deletion.drives) },
    { key: "prompt.deleteAssembly.actuators", names: names(deletion.actuators) },
    { key: "prompt.deleteAssembly.sensors", names: names(deletion.sensors) },
    { key: "prompt.deleteAssembly.removedTags", names: deletion.removedTags },
    { key: "prompt.deleteAssembly.addedTags", names: deletion.addedTags },
  ];
  const kept = deletion.reanchoredAssemblies.map(({ name }) =>
    t("prompt.deleteAssembly.reanchored", { name, deleted: deletion.assembly.name }),
  );
  return [...groups.map((group) => groupLine(group, t)), ...kept].filter(
    (line): line is string => line !== null,
  );
}
