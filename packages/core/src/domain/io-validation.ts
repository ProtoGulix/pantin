import type {
  IoChannel,
  IoDocument,
  IoModule,
  IoPath,
  IoProblem,
  IoTagOwner,
  IoUnmappedTag,
  TagDirection,
  TagType,
} from "@pantin/protocol";
import { variableProblemOf } from "./io-identifiers.ts";
import { rulesOf } from "./io-transports.ts";
import { variableScopeProblems } from "./io-variable-scope.ts";

// The rules of ADR 0049 point 6 and ADR 0064 point 5, against the open
// document's tag list (unsaved edits included): pure, from a mapping already
// parsed. The rules common to every transport are here; each transport's own
// rules come from its folder through the registry. Unmapped tags are a
// warning, not a problem.

export type IoTag = {
  name: string;
  type: TagType;
  direction: TagDirection;
  owner: IoTagOwner;
};

export type IoValidation = { problems: IoProblem[]; unmappedTags: IoUnmappedTag[] };

/** A channel with the place it has in the mapping, to name it in a problem. */
type Placed = { channel: IoChannel; module: IoModule; moduleIndex: number; channelIndex: number };

function channelPath(placed: Placed, field: string): IoPath {
  return ["modules", placed.moduleIndex, "channels", placed.channelIndex, field];
}

function problem(placed: Placed, field: string, code: IoProblem["code"], message: string) {
  return { path: channelPath(placed, field), code, message } satisfies IoProblem;
}

function signalProblems(placed: Placed, tag: IoTag | undefined): IoProblem[] {
  const { channel, module } = placed;
  if (tag === undefined) {
    return [
      problem(
        placed,
        "tag",
        "unknown_tag",
        `Tag "${channel.tag}" does not exist in this Pantin. It may have been renamed or deleted: list the tags with GET /api/pantins/<id>/tags.`,
      ),
    ];
  }
  if (!rulesOf(module.transport).supportsSignal(tag)) {
    return [
      problem(
        placed,
        "tag",
        "unsupported_signal",
        `Tag "${channel.tag}" (a ${tag.type} ${tag.direction}) cannot be carried by the ${module.transport.kind} transport of module "${module.key}": map it in a module of another transport.`,
      ),
    ];
  }
  return [];
}

function channelProblems(placed: Placed, tag: IoTag | undefined): IoProblem[] {
  const variable = variableProblemOf(placed.channel.variable);
  return [
    ...signalProblems(placed, tag),
    ...(variable === null
      ? []
      : [problem(placed, "variable", "invalid_variable", variable.message)]),
  ];
}

// The second and later channels with the same variable are the problem; the
// message names the first. IEC 61131-3 names ignore case. The same tag in two
// modules may share its variable: it is one PLC variable fed by both.
function duplicateVariableProblems(placedChannels: readonly Placed[]): IoProblem[] {
  const firstTags = new Map<string, string>();
  const problems: IoProblem[] = [];
  for (const placed of placedChannels) {
    const key = placed.channel.variable.toLowerCase();
    const first = firstTags.get(key);
    if (first === undefined) {
      firstTags.set(key, placed.channel.tag);
    } else if (first !== placed.channel.tag) {
      problems.push(
        problem(
          placed,
          "variable",
          "duplicate_variable",
          `Variable "${placed.channel.variable}" is already used by tag "${first}" (names are compared without case).`,
        ),
      );
    }
  }
  return problems;
}

// A feedback may be read through several modules, a command is written by one
// PLC input only: the second and later channels of a command are the problem.
function commandMappedTwiceProblems(
  placedChannels: readonly Placed[],
  tagsByName: ReadonlyMap<string, IoTag>,
): IoProblem[] {
  const firstModules = new Map<string, string>();
  const problems: IoProblem[] = [];
  for (const placed of placedChannels) {
    const tag = tagsByName.get(placed.channel.tag);
    if (tag?.direction !== "command") {
      continue;
    }
    const first = firstModules.get(tag.name);
    if (first === undefined) {
      firstModules.set(tag.name, placed.module.key);
    } else {
      problems.push(
        problem(
          placed,
          "tag",
          "command_mapped_twice",
          `Command "${tag.name}" is already mapped in module "${first}": a command is mapped once, in one module.`,
        ),
      );
    }
  }
  return problems;
}

function listenPortProblems(document: IoDocument): IoProblem[] {
  const owners = new Map<number, string>();
  const problems: IoProblem[] = [];
  document.modules.forEach((module, moduleIndex) => {
    const port = rulesOf(module.transport).listenPort(module.transport);
    if (port === null) {
      return;
    }
    const owner = owners.get(port);
    if (owner === undefined) {
      owners.set(port, module.key);
    } else {
      problems.push({
        path: ["modules", moduleIndex, "transport", "port"],
        code: "listen_port_used_twice",
        message: `Port ${port} is already used by module "${owner}": each module listens on its own port.`,
      });
    }
  });
  return problems;
}

function transportProblems(
  document: IoDocument,
  tagsByName: ReadonlyMap<string, IoTag>,
): IoProblem[] {
  return document.modules.flatMap((module, moduleIndex) =>
    rulesOf(module.transport)
      .validateModule(module, tagsByName)
      .map((found) => ({ ...found, path: ["modules", moduleIndex, ...found.path] })),
  );
}

function comparePaths(first: IoPath, second: IoPath): number {
  for (const [index, a] of first.entries()) {
    const b = second[index];
    if (b === undefined) {
      return 1;
    }
    if (a !== b) {
      return typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a) < String(b)
          ? -1
          : 1;
    }
  }
  return first.length - second.length;
}

function placedChannelsOf(document: IoDocument): Placed[] {
  return document.modules.flatMap((module, moduleIndex) =>
    module.channels.map((channel, channelIndex) => ({
      channel,
      module,
      moduleIndex,
      channelIndex,
    })),
  );
}

/** Checks the channels against the document's tags; problems are sorted by path. */
export function validateIoDocument(document: IoDocument, tags: readonly IoTag[]): IoValidation {
  const tagsByName = new Map(tags.map((tag) => [tag.name, tag]));
  const placedChannels = placedChannelsOf(document);
  const problems = [
    ...placedChannels.flatMap((placed) =>
      channelProblems(placed, tagsByName.get(placed.channel.tag)),
    ),
    ...duplicateVariableProblems(placedChannels),
    ...commandMappedTwiceProblems(placedChannels, tagsByName),
    ...listenPortProblems(document),
    ...variableScopeProblems(document),
    ...transportProblems(document, tagsByName),
  ].sort((a, b) => comparePaths(a.path, b.path));
  const mapped = new Set(placedChannels.map(({ channel }) => channel.tag));
  const unmappedTags = tags
    .filter((tag) => !mapped.has(tag.name))
    .map(({ name, type, direction, owner }) => ({ name, type, direction, owner }));
  return { problems, unmappedTags };
}
