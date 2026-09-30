import { driveTagUnit } from "../drives/drive-tags.ts";
import { parseNumber } from "../joints/joint-form.ts";
import { coordinateFromDisplay } from "../units.ts";
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
    await refreshTagValues(store);
  }
}

/** A bit flips from what the core last reported. */
export async function toggleBitTag(store: ViewerStore, name: string): Promise<void> {
  await writeTag(store, name, (store.tagValues.get(name) ?? 0) >= 0.5 ? 0 : 1);
}

/** Typed in mm or degrees (per second), sent in SI. */
export async function writeFloatTag(store: ViewerStore, name: string, text: string) {
  const document = store.state.openPantin?.document;
  const unit = document === undefined ? null : driveTagUnit(document, name);
  const typed = parseNumber(text);
  if (Number.isFinite(typed)) {
    await writeTag(store, name, unit === null ? typed : coordinateFromDisplay(unit, typed));
  }
}

/**
 * Reads every tag value of the open Pantin, while the right-hand panel shows
 * them or its sensors light up in 3D (ADR 0024). A failed read changes
 * nothing on screen: the next one retries, and a core that went away is
 * already reported by the pose stream (message.poseClosed).
 */
export async function refreshTagValues(store: ViewerStore): Promise<void> {
  const open = store.state.openPantin;
  const shown = store.state.drivePanelOpen || (open?.document.sensors.length ?? 0) > 0;
  if (open === null || !shown || store.readingTags) {
    return;
  }
  store.readingTags = true;
  const answer = await store.ports.api.listTags(open.id).catch(() => null);
  store.readingTags = false;
  // An answer for a Pantin closed meanwhile is dropped.
  if (answer !== null && store.state.openPantin?.id === open.id) {
    store.showTagValues(new Map(answer.tags.map((tag) => [tag.name, tag.value])));
  }
}
