import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { IO_JSON_FILE_NAME, type IoDocument, type IoZone, type Tag } from "@pantin/protocol";
import { serializeIoDocument } from "../domain/io-document-text.ts";
import type { BusAxis } from "./bus-axis.ts";
import { sendRaw } from "./test-server.ts";

// The mapping files of the "axis" test Pantin, written straight to its folder.
// The open Pantin keeps the mapping it read when it opened (ADR 0049 point 3):
// `loadIo` writes io.json then discards, which is how an outside edit is seen.

export type ChannelSpec = { tag: Tag; module: string };

function zoneOf(tag: Tag): IoZone {
  const command = tag.direction === "command";
  if (tag.type === "bit") {
    return command ? "coil" : "discrete_input";
  }
  return command ? "holding_register" : "input_register";
}

/** A valid mapping of the given tags on modules m1 (port 1502) and m2 (1503). */
export function ioDocumentOf(specs: readonly ChannelSpec[]): IoDocument {
  const channelsOf = (module: string) =>
    specs
      .filter((spec) => spec.module === module)
      .map(({ tag }, index) => ({
        tag: tag.name,
        variable: tag.name.replaceAll(".", "_"),
        zone: zoneOf(tag),
        // Two apart: a REAL or a DINT takes two registers.
        address: index * 2,
        ioType:
          tag.type === "bit"
            ? ("BOOL" as const)
            : tag.type === "float"
              ? ("REAL" as const)
              : ("DINT" as const),
        comment: "",
      }));
  const settings = { unitId: 1, wordOrder: "low_word_first", watchdogMilliseconds: 1000 } as const;
  return {
    schema_version: 1,
    modules: [
      { key: "m1", port: 1502, ...settings, channels: channelsOf("m1") },
      { key: "m2", port: 1503, ...settings, channels: channelsOf("m2") },
    ],
  };
}

export function ioTextOf(specs: readonly ChannelSpec[]): string {
  return serializeIoDocument(ioDocumentOf(specs));
}

function folderOf(axis: BusAxis): string {
  return join(axis.workspace.pantinsDirectory, "axis");
}

export function writeIoJsonFile(axis: BusAxis, text: string): Promise<void> {
  return writeFile(join(folderOf(axis), IO_JSON_FILE_NAME), text);
}

export function writeLegacyFile(axis: BusAxis, name: string, text: string): Promise<void> {
  return writeFile(join(folderOf(axis), name), text);
}

/** Discards the open Pantin's edits: it re-reads both files from disk. */
export async function discardAxis(axis: BusAxis): Promise<void> {
  const response = await sendRaw(axis.server, "POST", "/api/pantins/axis/discard");
  if (response.status !== 200) {
    throw new Error(`Discard answered ${response.status}: ${response.body}`);
  }
}

/** Writes io.json and has the open Pantin read it. */
export async function loadIo(axis: BusAxis, text: string): Promise<void> {
  await writeIoJsonFile(axis, text);
  await discardAxis(axis);
}
