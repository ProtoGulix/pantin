import type { PantinDocument } from "@pantin/protocol";
import { showsJointStar, showsViewport } from "../central-layout.ts";
import { createTranslator, type Translate } from "../i18n/translate.ts";
import { selectedNodeIdsOf } from "../selection.ts";
import type { ViewerState } from "../viewer-state.ts";
import { buildJointStarForest } from "./joint-star-forest.ts";
import { type StarHighlight, starHighlight } from "./joint-star-highlight.ts";
import { layoutJointStar, type StarLayout } from "./joint-star-layout.ts";

// What the joint view draws, as plain data. The layout depends on the document and on
// which nodes are unfolded, and the fold belongs to the view (it is never saved), so the
// model hands out `layoutFor`: the same function while the document is the same, which
// tells the view not to start over, and the same layout for the same fold.

type LayoutFor = (unfolded: ReadonlySet<string>) => StarLayout;

export type JointStarModel =
  | { shown: false }
  | {
      shown: true;
      pantinId: string;
      layoutFor: LayoutFor;
      // What the selection marks, in the layout the view drew.
      highlightFor: (layout: StarLayout) => StarHighlight;
      // The 3D view is shown too: Enter and a double click frame there; alone, they only select.
      viewportShown: boolean;
      // The tree rows that are selected, unlike the highlight (a folded body shows on its group).
      selectedTreeIds: ReadonlySet<string>;
      translate: Translate;
    };

function layoutBuilderFor(document: PantinDocument): LayoutFor {
  let last: { key: string; layout: StarLayout } | null = null;
  return (unfolded) => {
    const key = [...unfolded].sort().join("\n");
    if (last === null || last.key !== key) {
      last = { key, layout: layoutJointStar(buildJointStarForest(document, unfolded)) };
    }
    return last.layout;
  };
}

export function createJointStarModelBuilder(): (state: ViewerState) => JointStarModel {
  let last: { document: PantinDocument; layoutFor: LayoutFor } | null = null;
  return (state) => {
    const open = state.openPantin;
    if (!showsJointStar(state.centralLayout) || open === null) {
      return { shown: false };
    }
    if (last === null || last.document !== open.document) {
      last = { document: open.document, layoutFor: layoutBuilderFor(open.document) };
    }
    const { document } = open;
    return {
      shown: true,
      pantinId: open.id,
      layoutFor: last.layoutFor,
      highlightFor: (layout) =>
        starHighlight(document, layout, state.selection, state.multiSelectedNodeIds),
      viewportShown: showsViewport(state.centralLayout),
      selectedTreeIds: new Set(selectedNodeIdsOf(state.selection, state.multiSelectedNodeIds)),
      translate: createTranslator(state.language),
    };
  };
}
