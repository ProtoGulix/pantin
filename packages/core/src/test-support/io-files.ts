import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  IO_LIST_FILE_NAME,
  IO_LIST_HEADER,
  IO_MODULES_FILE_NAME,
  type Tag,
} from "@pantin/protocol";
import type { BusAxis } from "./bus-axis.ts";

// The mapping files of the "axis" test Pantin, written straight to its folder.

export const MODULES_JSON = JSON.stringify({
  schema_version: 1,
  modules: [
    { key: "m1", port: 1502 },
    { key: "m2", port: 1503 },
  ],
});

export type RowSpec = { tag: Tag; module: string };

/** One io.csv row for a tag, at the address given for its zone. */
function csvRow({ tag, module }: RowSpec, address: number): string {
  const bit = tag.type === "bit";
  const command = tag.direction === "command";
  const zone = bit
    ? command
      ? "coil"
      : "discrete_input"
    : command
      ? "holding_register"
      : "input_register";
  const ioType = bit ? "BOOL" : tag.type === "float" ? "REAL" : "DINT";
  return [tag.name, tag.name.replaceAll(".", "_"), module, zone, address, ioType, ""].join(";");
}

/** A valid io.csv: every given tag, each in its own address range. */
export function csvText(specs: readonly RowSpec[]): string {
  const rows = specs.map((spec, index) => csvRow(spec, index * 2));
  return `${[IO_LIST_HEADER, ...rows].join("\n")}\n`;
}

export async function writeIoFiles(
  axis: BusAxis,
  files: { csv?: string; modules?: string },
): Promise<void> {
  const folder = join(axis.workspace.pantinsDirectory, "axis");
  if (files.csv !== undefined) {
    await writeFile(join(folder, IO_LIST_FILE_NAME), files.csv);
  }
  if (files.modules !== undefined) {
    await writeFile(join(folder, IO_MODULES_FILE_NAME), files.modules);
  }
}
