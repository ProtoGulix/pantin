import type { IoTagOwner } from "@pantin/protocol";

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
  // A channel is named by its module and its tag: a feedback may be in several modules.
  editIoChannel(moduleKey: string, tag: string, field: string, text: string): void;
  // Derives the transport fields of the channel again from its tag.
  reassignIoChannel(moduleKey: string, tag: string): void;
  unmapIoChannel(moduleKey: string, tag: string): void;
  // Downloads the CODESYS GVL the core generates from the mapping.
  exportIoGvl(): void;
  // Downloads the CSV of the mapping the core generates (read-only export).
  exportIoCsv(): void;
  // The mapping could not be read: forget the failure and read it again.
  retryIoMapping(): void;
  // A tag was clicked: select its owner and unfold the tree to it, staying on
  // the I/O view (ADR 0049 point 11).
  selectIoOwner(owner: IoTagOwner): void;
  // From the inspector or a device row: show a tag, or the element's first
  // one, in the I/O view.
  showTagInIo(tag: string): void;
  showDeviceInIo(nodeId: string): void;
}
