// What the user asks for from the side panel. Components only raise intents;
// the controller decides what to call and how the state changes. Values that
// come from form fields arrive as raw strings and are validated there.
export interface PanelIntents {
  openPantin(pantinId: string): void;
  createPantin(name: string): void;
  renamePantin(name: string): void;
  savePantin(): void;
  chooseImportFile(file: File): void;
  changeImportUnit(unit: string): void;
  changeImportUpAxis(upAxis: string): void;
  confirmImport(): void;
  cancelImport(): void;
  selectBody(bodyId: string): void;
  renameBody(bodyId: string, name: string): void;
  dismissError(): void;
}
