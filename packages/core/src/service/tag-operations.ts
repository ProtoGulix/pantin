import type { PantinId, Tag, TagListResponse } from "@pantin/protocol";
import { forcedTagWrittenEvent } from "../domain/console-events.ts";
import { writeSpawnValue } from "../domain/physics-state.ts";
import { type TagEntry, tagEntries } from "../domain/tag-entries.ts";
import {
  decideRelease,
  decideWrite,
  pruneTagStates,
  type TagState,
  UNWRITTEN_TAG_STATE,
  type WriteSource,
} from "../domain/tag-states.ts";
import { tagValueProblem } from "../domain/tag-values.ts";
import {
  commandTagOf,
  describeTag,
  describeTags,
  tagStateKey,
  tagValueOf,
} from "../domain/tags.ts";
import { ApiError } from "../errors.ts";
import { recordConsoleEvents } from "./console-record.ts";
import { loadPantin, type OpenPantin, type ServiceContext } from "./open-pantins.ts";

// Writing, forcing and releasing tags (ADR 0012, ADR 0031 point 6, ADR 0045
// point 5). A client write forces its tag; a PLC write applies unless the tag
// is forced.

export type TagWriteOutcome = {
  // The tag after the write: for an ignored PLC write, still the forced value.
  tag: Tag;
  ignored: "forced" | null;
};

/** Forgets the states of tags whose element was deleted since the last call. */
export function syncTagStates(openPantin: OpenPantin): void {
  if (openPantin.tagStatesDocument === openPantin.document) {
    return;
  }
  openPantin.tagStatesDocument = openPantin.document;
  pruneTagStates(openPantin.tagStates, new Set(tagEntries(openPantin.document).map(tagStateKey)));
}

function stateOf(openPantin: OpenPantin, entry: TagEntry): TagState {
  return openPantin.tagStates.get(tagStateKey(entry)) ?? UNWRITTEN_TAG_STATE;
}

// A joint setpoint is queued and consumed by the next step; a drive command
// is a level the drive reads at every step until it is written again.
function applyCommandValue(openPantin: OpenPantin, entry: TagEntry, value: number): void {
  const { owner } = entry;
  if (owner.kind === "emitter") {
    // Latched now, served by the next step (ADR 0043 point 5).
    openPantin.physicsState = writeSpawnValue(openPantin.physicsState, owner.emitter.id, value);
  } else if (owner.kind === "joint") {
    openPantin.setpoints.set(owner.joint.id, value);
    openPantin.queuedSetpoints.set(owner.joint.id, value);
  } else if (owner.kind === "drive") {
    // Sensors have feedback tags only, which commandTagOf refuses.
    const commands = openPantin.driveCommands.get(owner.drive.id) ?? {};
    openPantin.driveCommands.set(owner.drive.id, { ...commands, [entry.member]: value });
  }
}

// Decides, stores the new state and applies the value when the write is not
// ignored. Returns whether it was applied.
function writeEntry(
  openPantin: OpenPantin,
  entry: TagEntry,
  value: number,
  source: WriteSource,
): boolean {
  const decision = decideWrite(stateOf(openPantin, entry), source, value);
  openPantin.tagStates.set(tagStateKey(entry), decision.state);
  if (decision.applied) {
    applyCommandValue(openPantin, entry, value);
  }
  return decision.applied;
}

function describeTagList(openPantin: OpenPantin): TagListResponse {
  return {
    stepCount: openPantin.stepCount,
    tags: describeTags(openPantin.document, openPantin),
    // Copies: the response must not alias state the next step replaces.
    drives: openPantin.document.drives.map((drive) => ({
      id: drive.id,
      ports: { ...openPantin.drivePortStates.get(drive.id) },
      diagnostics: [...(openPantin.driveDiagnostics.get(drive.id) ?? [])],
    })),
  };
}

export async function listTags(
  context: ServiceContext,
  pantinId: PantinId,
): Promise<TagListResponse> {
  const openPantin = await loadPantin(context, pantinId);
  syncTagStates(openPantin);
  return describeTagList(openPantin);
}

export async function writeTag(
  context: ServiceContext,
  pantinId: PantinId,
  tagName: string,
  value: number,
  source: WriteSource,
): Promise<TagWriteOutcome> {
  const openPantin = await loadPantin(context, pantinId);
  syncTagStates(openPantin);
  const entry = commandTagOf(openPantin.document, tagName);
  const problem = tagValueProblem(tagName, entry.type, value);
  if (problem !== null) {
    throw new ApiError("invalid_request", problem);
  }
  const applied = writeEntry(openPantin, entry, value, source);
  if (!applied) {
    recordConsoleEvents(context, openPantin, [
      forcedTagWrittenEvent(tagName, tagValueOf(entry, openPantin), value),
    ]);
  }
  return { tag: describeTag(entry, openPantin), ignored: applied ? null : "forced" };
}

// Ends the force; the PLC's last value then applies as a PLC write.
function releaseEntry(openPantin: OpenPantin, entry: TagEntry): void {
  const decision = decideRelease(stateOf(openPantin, entry));
  openPantin.tagStates.set(tagStateKey(entry), decision.state);
  if (decision.reapplyValue !== null) {
    writeEntry(openPantin, entry, decision.reapplyValue, "plc");
  }
}

export async function releaseTag(
  context: ServiceContext,
  pantinId: PantinId,
  tagName: string,
): Promise<Tag> {
  const openPantin = await loadPantin(context, pantinId);
  syncTagStates(openPantin);
  const entry = commandTagOf(openPantin.document, tagName);
  releaseEntry(openPantin, entry);
  return describeTag(entry, openPantin);
}

export async function releaseAllTags(
  context: ServiceContext,
  pantinId: PantinId,
): Promise<TagListResponse> {
  const openPantin = await loadPantin(context, pantinId);
  syncTagStates(openPantin);
  for (const entry of tagEntries(openPantin.document)) {
    if (entry.direction === "command" && stateOf(openPantin, entry).forced) {
      releaseEntry(openPantin, entry);
    }
  }
  return describeTagList(openPantin);
}

/**
 * The watchdog (ADR 0045 point 11): 0 as a PLC write to these bit commands.
 * A forced tag keeps its forced value and only its PLC last value becomes 0.
 * A name the Pantin no longer has, or that is not a bit command, is skipped.
 * Nothing is logged for the writes: they are not the PLC speaking.
 */
export function zeroBitCommands(openPantin: OpenPantin, tagNames: readonly string[]): void {
  syncTagStates(openPantin);
  const wanted = new Set(tagNames);
  for (const entry of tagEntries(openPantin.document)) {
    if (wanted.has(entry.name) && entry.direction === "command" && entry.type === "bit") {
      writeEntry(openPantin, entry, 0, "plc");
    }
  }
}
