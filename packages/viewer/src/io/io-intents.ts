// What the I/O view asks of the controller (ADR 0049 point 11). Field texts
// arrive raw, as typed; the controller parses them (io-edits.ts).
export interface IoIntents {
  selectIoModule(moduleKey: string): void;
  // A problem of the list was clicked: show its module and focus its cell
  // (`moduleKey` is null for a problem that has no module).
  focusIoProblem(moduleKey: string | null, cellId: string): void;
  // The first one creates io.json.
  addIoModule(): void;
  editIoModule(moduleKey: string, field: string, text: string): void;
  removeIoModule(moduleKey: string): void;
  mapIoTags(moduleKey: string, tags: readonly string[]): void;
  editIoChannel(tag: string, field: string, text: string): void;
  // Derives zone and type of the channel again from its tag.
  reassignIoChannel(tag: string): void;
  unmapIoChannel(tag: string): void;
}
