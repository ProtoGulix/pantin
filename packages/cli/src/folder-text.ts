import { describeIoProblem } from "@pantin/core";
import type { IoMappingResponse } from "@pantin/protocol";
import { CANONICAL_ORDER_NOTE, readFolderIo } from "./io-folder.ts";
import { readFolderDocument } from "./validate-folder.ts";

// The text a command generates from the io.json of a folder: the GVL of
// `pantin gvl` (ADR 0045 point 9, ADR 0049 point 9) and the CSV of
// `pantin io export` (ADR 0049 amendment of 2026-10-20). The generators are the
// core's; this only reads the folder and refuses a mapping that is not valid.

export type GeneratedText = { exitCode: number; text: string; errors: string[] };

type Modules = IoMappingResponse["modules"];

function refusal(answer: IoMappingResponse, canonical: boolean, what: string): string[] {
  if (answer.status === "missing") {
    return ['No io.json in this folder: run "pantin io init <folder>" first.'];
  }
  return [
    `The mapping is invalid, so no ${what} is generated:`,
    ...answer.problems.map(describeIoProblem),
    ...(canonical ? [] : [CANONICAL_ORDER_NOTE]),
  ];
}

export async function generateFromFolder(
  folder: string,
  what: string,
  render: (modules: Modules) => string,
): Promise<GeneratedText> {
  const read = await readFolderDocument(folder);
  if ("problems" in read) {
    return { exitCode: 1, text: "", errors: read.problems };
  }
  const { answer, canonical } = await readFolderIo(folder, read.document);
  if (answer.status !== "valid") {
    return { exitCode: 1, text: "", errors: refusal(answer, canonical, what) };
  }
  const errors =
    answer.unmappedTags.length === 0
      ? []
      : [`note: ${answer.unmappedTags.length} tag(s) are not mapped and not in the ${what}.`];
  return { exitCode: 0, text: render(answer.modules), errors };
}
