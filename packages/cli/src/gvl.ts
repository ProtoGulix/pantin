import { describeIoProblem, renderGvl } from "@pantin/core";
import type { IoMappingResponse } from "@pantin/protocol";
import { CANONICAL_ORDER_NOTE, readFolderIo } from "./io-folder.ts";
import { readFolderDocument } from "./validate-folder.ts";

// `pantin gvl <folder>` (ADR 0045 point 9, ADR 0049 point 9): prints the GVL of a
// valid mapping, rendered by the core's generator (ADR 0049 amendment).

export type GvlResult = { exitCode: number; stdout: string; errors: string[] };

function refusal(answer: IoMappingResponse, canonical: boolean): string[] {
  if (answer.status === "missing") {
    return ['No io.json in this folder: run "pantin io init <folder>" first.'];
  }
  return [
    "The mapping is invalid, so no GVL is generated:",
    ...answer.problems.map(describeIoProblem),
    ...(canonical ? [] : [CANONICAL_ORDER_NOTE]),
  ];
}

export async function generateGvl(folder: string): Promise<GvlResult> {
  const read = await readFolderDocument(folder);
  if ("problems" in read) {
    return { exitCode: 1, stdout: "", errors: read.problems };
  }
  const { answer, canonical } = await readFolderIo(folder, read.document);
  if (answer.status !== "valid") {
    return { exitCode: 1, stdout: "", errors: refusal(answer, canonical) };
  }
  const errors =
    answer.unmappedTags.length === 0
      ? []
      : [`note: ${answer.unmappedTags.length} tag(s) are not mapped and not in the GVL.`];
  return { exitCode: 0, stdout: renderGvl(answer.modules), errors };
}
