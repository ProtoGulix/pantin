import type { MenuCommand } from "../menu/menu-model.ts";
import type { PromptAction } from "../panel/prompt-model.ts";

// What the user asks for from the menu bar and the left panel. Components
// only raise intents; the controller decides what to call and how the state
// changes. Values from form fields arrive as raw strings, validated there.
export interface PanelIntents {
  runMenuCommand(command: MenuCommand): void;

  // List view.
  selectListPantin(pantinId: string): void;
  openPantin(pantinId: string): void;
  toggleCreatePantin(): void;
  createPantin(name: string): void;

  // Edit view.
  requestClose(): void;
  savePantin(): void;
  frameAll(): void;
  frameSelection(): void;
  frameNode(nodeId: string): void;
  selectNode(nodeId: string): void;
  setExpanded(nodeId: string, expanded: boolean): void;
  activateNode(nodeId: string): void;
  startRename(nodeId: string): void;
  commitRename(nodeId: string, name: string): void;
  cancelRename(): void;
  requestDelete(nodeId: string): void;
  openContextMenu(nodeId: string, x: number, y: number): void;
  closeContextMenu(): void;
  resolvePrompt(action: PromptAction): void;

  // targetPantinId: the Pantin chosen from its context menu, or null for the open one.
  chooseImportFile(file: File, targetPantinId: string | null): void;
  changeImportUnit(unit: string): void;
  changeImportUpAxis(upAxis: string): void;
  confirmImport(): void;
  cancelImport(): void;

  togglePropertyGroup(groupId: string): void;
  dismissMessage(): void;
  changeLanguage(language: string): void;
}
