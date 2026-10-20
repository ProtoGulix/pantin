import { renderIoCsv } from "@pantin/core";
import { generateFromFolder } from "./folder-text.ts";

/** `pantin io export <folder>`: the CSV of a valid mapping (read-only export). */
export function exportIoCsv(folder: string) {
  return generateFromFolder(folder, "CSV", renderIoCsv);
}
