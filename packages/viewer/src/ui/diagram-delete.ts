import { edgeInto, edgesFrom, type FocusTarget } from "../diagram/diagram-focus.ts";
import { endpointLabel, type LinkChoice } from "../diagram/diagram-link-targets.ts";
import type { ChainDiagram } from "../diagram/diagram-types.ts";
import type { MessageKey } from "../i18n/translate.ts";
import type { PanelIntents } from "./panel-intents.ts";

// What Delete does in the diagram (ADR 0030 point 4): it removes a link, or
// shows a hint, and never removes an element, whatever is selected. The key
// handler (diagram-keys.ts) only reads the focus and calls this.

/** A menu of choices beside the item that has the focus; `choose` gets the picked one. */
type OpenMenu = (
  title: MessageKey,
  choices: readonly LinkChoice[],
  choose: (choice: LinkChoice) => void,
) => void;

interface DeleteCall {
  // The link the focused item stands for, when it is a link.
  edgeId: string | null;
  // Null for a link or a band, which are not nodes.
  target: FocusTarget | null;
  diagram: ChainDiagram;
  intents: Pick<PanelIntents, "removeDiagramLink" | "showDiagramHint">;
  openMenu: OpenMenu;
}

// A port with no incoming link may have outgoing ones (a drive output, an
// actuator's anchor): one is removed, several are picked from a menu.
function removeOutgoing(call: DeleteCall, ports: FocusTarget): boolean {
  const { diagram, intents, openMenu } = call;
  const edges = edgesFrom(diagram, ports);
  const [only] = edges;
  if (only !== undefined && edges.length === 1) {
    intents.removeDiagramLink(only.fromNode, only.toNode);
    return true;
  }
  if (edges.length === 0) {
    return false;
  }
  const choices = edges.map((edge) => ({
    endpoint: { nodeId: edge.toNode, socketId: edge.toSocket },
    label: endpointLabel(diagram, { nodeId: edge.toNode, socketId: edge.toSocket }),
  }));
  openMenu("diagram.removeMenu", choices, (choice) =>
    intents.removeDiagramLink(ports.nodeId, choice.endpoint.nodeId),
  );
  return true;
}

export function deleteInDiagram(call: DeleteCall): void {
  const { edgeId, target, diagram, intents } = call;
  const port = target !== null && target.socketId !== null ? target : null;
  const ending = port === null ? null : edgeInto(diagram, port);
  const edge =
    edgeId === null ? ending : diagram.edges.find((candidate) => candidate.id === edgeId);
  if (edge !== undefined && edge !== null) {
    intents.removeDiagramLink(edge.fromNode, edge.toNode);
  } else if (port === null || !removeOutgoing(call, port)) {
    intents.showDiagramHint("diagram.hint.deleteOnPort");
  }
}
