import { createHash } from "node:crypto";
import {
  IO_SCHEMA_VERSION,
  type IoDocument,
  type IoMappingResponse,
  type IoProblem,
  type TransportKind,
} from "@pantin/protocol";
import { canonicalIoDocument, type IoReading } from "./io-document-text.ts";
import type { IoTag } from "./io-validation.ts";

// The projection of the open mapping on one transport kind (ADR 0065 point 7): what the
// bridge of that kind needs, and nothing that another kind's modules can change. A bridge
// started on a valid projection must not stop because a module of another kind is edited.

function tagFactsOf(modules: IoMappingResponse["modules"]): string[][] {
  const facts = new Map<string, string[]>();
  for (const module of modules) {
    for (const channel of module.channels) {
      if (channel.tagType !== null && channel.direction !== null) {
        facts.set(channel.tag, [channel.tag, channel.tagType, channel.direction]);
      }
    }
  }
  return [...facts.values()].sort((first, second) =>
    (first[0] ?? "") < (second[0] ?? "") ? -1 : 1,
  );
}

// A problem belongs to the module its path starts in; the whole-file ones belong to every
// projection. The path then indexes the projection's own modules.
function projectedProblems(
  problems: readonly IoProblem[],
  newIndexByOldIndex: ReadonlyMap<number, number>,
): IoProblem[] {
  return problems.flatMap((problem) => {
    const [section, oldIndex, ...rest] = problem.path;
    if (section !== "modules" || typeof oldIndex !== "number") {
      return [problem];
    }
    const newIndex = newIndexByOldIndex.get(oldIndex);
    return newIndex === undefined ? [] : [{ ...problem, path: ["modules", newIndex, ...rest] }];
  });
}

function projectionIdOf(
  status: IoMappingResponse["status"],
  problems: readonly IoProblem[],
  modules: IoDocument["modules"],
  tagFacts: readonly string[][],
): string {
  const text = JSON.stringify({
    status,
    problems: problems.map(({ path, code, message }) => ({ path, code, message })),
    modules,
    tags: tagFacts,
  });
  return createHash("sha256").update(text).digest("hex");
}

/**
 * The answer of GET .../io?transport=<kind>, from the answer for the whole file. A missing or
 * unreadable file has no modules, so every projection is the whole answer.
 */
export function projectMapping(
  full: IoMappingResponse,
  reading: IoReading,
  tags: readonly IoTag[],
  kind: TransportKind,
): IoMappingResponse {
  if (reading.kind !== "document") {
    return full;
  }
  const newIndexByOldIndex = new Map<number, number>();
  full.modules.forEach((module, oldIndex) => {
    if (module.transport.kind === kind) {
      newIndexByOldIndex.set(oldIndex, newIndexByOldIndex.size);
    }
  });
  const modules = full.modules.filter((module) => module.transport.kind === kind);
  const problems = projectedProblems(full.problems, newIndexByOldIndex);
  const status = problems.length === 0 ? "valid" : "invalid";
  const canonicalModules = canonicalIoDocument({
    schema_version: IO_SCHEMA_VERSION,
    modules: reading.document.modules.filter((module) => module.transport.kind === kind),
  }).modules;
  const mapped = new Set(
    modules.flatMap((module) => module.channels.map((channel) => channel.tag)),
  );
  return {
    status,
    mappingId: projectionIdOf(status, problems, canonicalModules, tagFactsOf(modules)),
    modules,
    problems,
    unmappedTags: tags
      .filter((tag) => !mapped.has(tag.name))
      .map(({ name, type, direction, owner }) => ({ name, type, direction, owner })),
  };
}
