// What the user asks for from the left panel. Components only raise intents;
// the controller decides what to call and how the state changes. Values that
// come from form fields arrive as raw strings and are validated there.
export interface PanelIntents {
  toggleCreatePantin(): void;
  createPantin(name: string): void;
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
  openContextMenu(nodeId: string, x: number, y: number): void;
  closeContextMenu(): void;

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
