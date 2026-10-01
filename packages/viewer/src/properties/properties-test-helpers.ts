import type { Translate } from "../i18n/translate.ts";
import { GROUP_TITLES } from "./group-titles.ts";
import { nodeGroups, type PropertySource } from "./properties-model.ts";
import type { PropertyGroup } from "./property-rows.ts";

/** The properties of a tree node with their titles, as the inspector shows them. */
export function titledNodeGroups(
  source: PropertySource,
  nodeId: string,
  t: Translate,
): PropertyGroup[] {
  return nodeGroups(source, nodeId, t).map((draft) => ({
    ...draft,
    title: t(GROUP_TITLES[draft.id]),
    collapsed: false,
  }));
}
