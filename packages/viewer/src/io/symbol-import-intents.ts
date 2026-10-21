// What the PLC symbol import dialog asks of the controller (ADR 0064 point 14).
export interface SymbolImportIntents {
  // The file chosen in the picker: read by the core, shown in the dialog. Changes nothing yet.
  importIoSymbols(file: File): void;
  toggleSymbolRow(rowKey: string): void;
  // An empty reference clears the choice.
  pickSymbol(rowKey: string, reference: string): void;
  // Sends exactly the checked rows and the picker choices.
  applySymbolImport(): void;
  // Cancel, Close and Escape: sends nothing.
  closeSymbolImport(): void;
}
