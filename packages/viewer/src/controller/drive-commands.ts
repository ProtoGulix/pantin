import { isBitOn } from "../bit-tag.ts";
import { showsDiagram } from "../central-layout.ts";
import { forcedTagUnit } from "../drives/drive-tags.ts";
import { parseNumber } from "../joints/joint-form.ts";
import { runtimeByDriveId } from "../panel/drive-diagnostics.ts";
import { coordinateFromDisplay } from "../units.ts";
import { forcedTagNames } from "./tag-read.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Commanding drives from the panel as a PLC would, and showing what the core
// answers: tag writes, faults, and the tag values read several times a second.

export async function refreshFaults(store: ViewerStore): Promise<void> {
  const open = store.state.openPantin;
  if (open !== null) {
    await store.run(
      () => store.ports.api.getFaults(open.id),
      (current, faults) => ({ ...current, faults }),
    );
  }
}

export async function setDriveUnresponsive(store: ViewerStore, driveId: string, on: boolean) {
  const open = store.state.openPantin;
  if (open !== null) {
    const fault = on ? "unresponsive" : "none";
    await store.run(
      () => store.ports.api.setDriveFault(open.id, driveId, fault),
      (current, faults) => ({ ...current, faults }),
    );
  }
}

export async function setJointJammed(store: ViewerStore, jointId: string, on: boolean) {
  const open = store.state.openPantin;
  if (open !== null) {
    const fault = on ? "jammed" : "none";
    await store.run(
      () => store.ports.api.setJointFault(open.id, jointId, fault),
      (current, faults) => ({ ...current, faults }),
    );
  }
}

async function writeTag(store: ViewerStore, name: string, value: number): Promise<void> {
  const open = store.state.openPantin;
  if (open !== null) {
    await store.run(
      () => store.ports.api.writeTag(open.id, name, value),
      (current) => current,
    );
    await refreshTagValues(store, true);
  }
}

/** Gives a forced tag back to the PLC (ADR 0045 point 5). */
export async function releaseTag(store: ViewerStore, name: string): Promise<void> {
  const open = store.state.openPantin;
  if (open !== null) {
    await store.run(
      () => store.ports.api.releaseTag(open.id, name),
      (current) => current,
    );
    await refreshTagValues(store, true);
  }
}

/** Gives every forced tag of the open Pantin back to the PLC. */
export async function releaseAllTags(store: ViewerStore): Promise<void> {
  const open = store.state.openPantin;
  if (open !== null) {
    await store.run(
      () => store.ports.api.releaseAllTags(open.id),
      (current) => current,
    );
    await refreshTagValues(store, true);
  }
}

/** A bit flips from what the core last reported. */
export async function toggleBitTag(store: ViewerStore, name: string): Promise<void> {
  await writeTag(store, name, isBitOn(store.tagValues.get(name) ?? 0) ? 0 : 1);
}

/** Typed in mm or degrees (per second), sent in SI. */
export async function writeFloatTag(store: ViewerStore, name: string, text: string) {
  const document = store.state.openPantin?.document;
  const unit = document === undefined ? null : forcedTagUnit(document, name);
  const typed = parseNumber(text);
  if (Number.isFinite(typed)) {
    await writeTag(store, name, unit === null ? typed : coordinateFromDisplay(unit, typed));
  }
}

/**
 * Reads every tag value of the open Pantin, while the inspector shows them
 * (ADR 0030), its sensors light up in 3D (ADR 0024) or the chain diagram is
 * shown, alone or under the 3D view (ADR 0029 point 8, ADR 0030 point 7). A failed read changes
 * nothing on screen: the next one retries, and a core that went away is
 * already reported by the pose stream (message.poseClosed).
 */
export async function refreshTagValues(store: ViewerStore, always = false): Promise<void> {
  const open = store.state.openPantin;
  // `always`: right after a write or a release, so that the forced count is up to date.
  // A forced tag keeps the read going, so that a release made elsewhere is seen.
  const shown =
    always ||
    store.forcedTags.size > 0 ||
    store.state.inspectorOpen ||
    showsDiagram(store.state.centralLayout) ||
    (open?.document.sensors.length ?? 0) > 0 ||
    (open?.document.presenceSensors.length ?? 0) > 0;
  if (open === null || !shown || store.readingTags) {
    return;
  }
  store.readingTags = true;
  const answer = await store.ports.api.listTags(open.id).catch(() => null);
  store.readingTags = false;
  // An answer for a Pantin closed meanwhile is dropped.
  if (answer !== null && store.state.openPantin?.id === open.id) {
    store.showTagRead(
      new Map(answer.tags.map((tag) => [tag.name, tag.value])),
      runtimeByDriveId(answer.drives),
      forcedTagNames(answer.tags),
    );
  }
}
