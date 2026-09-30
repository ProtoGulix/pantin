import type { DiagramElementKind } from "../controller/diagram-edit-actions.ts";
import { columnX, NODE_WIDTH } from "../diagram/diagram-constants.ts";
import type { DiagramModel } from "../diagram/diagram-view-model.ts";
import type { Translate } from "../i18n/translate.ts";
import { button, element } from "./dom.ts";
import type { PanelIntents } from "./panel-intents.ts";

// The heads of the four columns (ADR 0029 point 6): the name of each role and a
// "+" that opens the panel's creation form. It stays at the top while the
// diagram scrolls. Joints have no "+": a joint links two existing bodies, which
// the tree knows about, so the head says where to make one instead.

type ShownModel = Extract<DiagramModel, { shown: true }>;

const COLUMNS = [
  { kind: "drive", creates: "drive" },
  { kind: "actuator", creates: "actuator" },
  { kind: "joint", creates: null },
  { kind: "sensor", creates: "sensor" },
] as const;

function addButton(creates: DiagramElementKind, t: Translate, intents: PanelIntents) {
  const label = t(`diagram.add.${creates}`);
  const added = button("+", "diagram-columns__add", () => intents.createDiagramElement(creates));
  added.setAttribute("aria-label", label);
  added.setAttribute("title", label);
  return added;
}

export function drawColumnHeads(model: ShownModel, intents: PanelIntents): HTMLElement {
  const t = model.translate;
  const heads = COLUMNS.map(({ kind, creates }, column) => {
    const name = element("span", {
      className: "diagram-columns__name",
      text: t(`diagram.column.${kind}`),
    });
    const style = `left: ${columnX(column)}px; width: ${NODE_WIDTH}px`;
    const attributes = creates === null ? { style, title: t("diagram.joint.why") } : { style };
    return element("div", { className: "diagram-columns__head", attributes }, [
      name,
      creates === null ? null : addButton(creates, t, intents),
    ]);
  });
  return element(
    "div",
    { className: "diagram-columns", attributes: { style: `width: ${model.diagram.width}px` } },
    heads,
  );
}
