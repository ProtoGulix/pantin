import type { PantinDocument } from "@pantin/protocol";
import { createTranslator, type Language, type Translate } from "../i18n/translate.ts";
import type { ViewerState } from "../viewer-state.ts";
import { layoutChainDiagram } from "./chain-layout.ts";
import type { ChainLinks } from "./diagram-chains.ts";
import { diagramHighlight, type NodeHighlight } from "./diagram-selection.ts";
import { nodeTypeLabels } from "./diagram-texts.ts";
import type { ChainDiagram } from "./diagram-types.ts";

// What the diagram view draws, as plain data. The layout is the costly part and
// only depends on the document, the collapsed bands and the language, so the
// builder keeps the last one: the view rebuilds its SVG when `diagram` is a
// new object, and only restyles nodes otherwise.

export type DiagramModel =
  | { shown: false }
  | {
      shown: true;
      document: PantinDocument;
      diagram: ChainDiagram;
      typeLabels: ReadonlyMap<string, string>;
      highlight: ReadonlyMap<string, NodeHighlight>;
      // No chain at all to draw (and no band collapsed): the view says how to start one.
      empty: boolean;
      translate: Translate;
    };

interface Layout {
  document: PantinDocument;
  collapsed: ReadonlySet<string>;
  language: Language;
  diagram: ChainDiagram;
  typeLabels: ReadonlyMap<string, string>;
}

export function createDiagramModelBuilder(
  linksOf: (document: PantinDocument) => ChainLinks,
): (state: ViewerState) => DiagramModel {
  let last: Layout | null = null;
  const layoutFor = (document: PantinDocument, state: ViewerState): Layout => {
    const { collapsedDiagramBands: collapsed, language } = state;
    if (
      last !== null &&
      last.document === document &&
      last.collapsed === collapsed &&
      last.language === language
    ) {
      return last;
    }
    const translate = createTranslator(language);
    last = {
      document,
      collapsed,
      language,
      diagram: layoutChainDiagram(document, collapsed, language),
      typeLabels: nodeTypeLabels(document, language, translate),
    };
    return last;
  };
  return (state) => {
    const open = state.openPantin;
    if (!state.diagramShown || open === null) {
      return { shown: false };
    }
    const { diagram, typeLabels } = layoutFor(open.document, state);
    return {
      shown: true,
      document: open.document,
      diagram,
      typeLabels,
      highlight: diagramHighlight(open.document, linksOf(open.document), {
        selectedNodeId: state.selectedNodeId,
        selectedDevice: state.selectedDevice,
      }),
      empty: diagram.nodes.length === 0 && diagram.bands.every((band) => !band.collapsed),
      translate: createTranslator(state.language),
    };
  };
}
