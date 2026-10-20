import { renderGvl } from "@pantin/core";
import { generateFromFolder } from "./folder-text.ts";

/** `pantin gvl <folder>`: the CODESYS global variable list of a valid mapping. */
export function generateGvl(folder: string) {
  return generateFromFolder(folder, "GVL", renderGvl);
}
