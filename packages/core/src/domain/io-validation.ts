import {
  type IoChannel,
  type IoDocument,
  type IoPath,
  type IoProblem,
  type IoTagOwner,
  type IoUnmappedTag,
  MODBUS_MAX_ADDRESS,
  type TagDirection,
  type TagType,
} from "@pantin/protocol";
import { variableProblemOf } from "./io-identifiers.ts";
import { BIT_ZONES, IO_TYPE_BY_TAG_TYPE, ioWidthOf, ZONES_BY_DIRECTION } from "./io-rules.ts";

// The rules of ADR 0049 point 6 that the schema cannot hold, against the open
// document's tag list (unsaved edits included): pure, from a mapping already
// parsed. Unmapped tags are a warning, not a problem.

export type IoTag = {
  name: string;
  type: TagType;
  direction: TagDirection;
  owner: IoTagOwner;
};

export type IoValidation = { problems: IoProblem[]; unmappedTags: IoUnmappedTag[] };

/** A channel with the place it has in the mapping, to name it in a problem. */
type Placed = { channel: IoChannel; moduleIndex: number; channelIndex: number };

function at(placed: Placed, field: keyof IoChannel): IoPath {
  return ["modules", placed.moduleIndex, "channels", placed.channelIndex, field];
}

function problem(placed: Placed, field: keyof IoChannel, code: IoProblem["code"], message: string) {
  return { path: at(placed, field), code, message } satisfies IoProblem;
}

function tagProblems(placed: Placed, tag: IoTag | undefined): IoProblem[] {
  const { channel } = placed;
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
  const problems: IoProblem[] = [];
  if (!ZONES_BY_DIRECTION[tag.direction].includes(channel.zone)) {
    const wanted = ZONES_BY_DIRECTION[tag.direction].join(" or ");
    problems.push(
      problem(
        placed,
        "zone",
        "zone_direction_mismatch",
        `Tag "${channel.tag}" is a ${tag.direction}: its zone is ${wanted}, not ${channel.zone}.`,
      ),
    );
  }
  if (channel.ioType !== IO_TYPE_BY_TAG_TYPE[tag.type]) {
    problems.push(
      problem(
        placed,
        "ioType",
        "type_mismatch",
        `Tag "${channel.tag}" is a ${tag.type}: its type is ${IO_TYPE_BY_TAG_TYPE[tag.type]}, not ${channel.ioType}.`,
      ),
    );
  }
  return problems;
}

// BOOL lives in a bit zone, REAL and DINT in a register zone, whatever the tag.
function typeZoneProblems(placed: Placed): IoProblem[] {
  const { channel } = placed;
  if ((channel.ioType === "BOOL") === BIT_ZONES.includes(channel.zone)) {
    return [];
  }
  const wanted =
    channel.ioType === "BOOL" ? "a coil or a discrete input" : "a holding or an input register";
  return [
    problem(
      placed,
      "zone",
      "type_zone_mismatch",
      `A ${channel.ioType} goes to ${wanted}, not to ${channel.zone}.`,
    ),
  ];
}

// The schema holds the start address in 0..65535; a REAL or DINT may still run past the end.
function lastAddressOf(channel: IoChannel): number {
  return channel.address + ioWidthOf(channel.ioType) - 1;
}

function rangeProblems(placed: Placed): IoProblem[] {
  const { channel } = placed;
  const last = lastAddressOf(channel);
  if (last <= MODBUS_MAX_ADDRESS) {
    return [];
  }
  return [
    problem(
      placed,
      "address",
      "address_out_of_range",
      `Address ${channel.address} is out of 0..${MODBUS_MAX_ADDRESS} (a ${channel.ioType} takes ${ioWidthOf(channel.ioType)} registers, up to ${last}).`,
    ),
  ];
}

function channelProblems(placed: Placed, tag: IoTag | undefined): IoProblem[] {
  const variable = variableProblemOf(placed.channel.variable);
  return [
    ...tagProblems(placed, tag),
    ...typeZoneProblems(placed),
    ...rangeProblems(placed),
    ...(variable === null ? [] : [problem(placed, "variable", "invalid_variable", variable)]),
  ];
}

// The second and later channels with the same variable are the problem; the
// message names the first. IEC 61131-3 names ignore case.
function duplicateVariableProblems(placedChannels: readonly Placed[]): IoProblem[] {
  const firstTags = new Map<string, string>();
  const problems: IoProblem[] = [];
  for (const placed of placedChannels) {
    const key = placed.channel.variable.toLowerCase();
    const first = firstTags.get(key);
    if (first === undefined) {
      firstTags.set(key, placed.channel.tag);
    } else {
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

function overlapProblems(placedChannels: readonly Placed[]): IoProblem[] {
  const groups = new Map<string, Placed[]>();
  for (const placed of placedChannels.filter(
    (candidate) => rangeProblems(candidate).length === 0,
  )) {
    const key = `${placed.moduleIndex}\u0000${placed.channel.zone}`;
    groups.set(key, [...(groups.get(key) ?? []), placed]);
  }
  return [...groups.values()].flatMap(overlapsInGroup);
}

// Channels of one module and zone, by address then position: each one that
// starts before the furthest reach so far overlaps the channel that reaches it.
function overlapsInGroup(group: readonly Placed[]): IoProblem[] {
  const sorted = group.toSorted(
    (a, b) => a.channel.address - b.channel.address || a.channelIndex - b.channelIndex,
  );
  const problems: IoProblem[] = [];
  let reaching: Placed | undefined;
  for (const placed of sorted) {
    const reach = reaching === undefined ? 0 : lastAddressOf(reaching.channel) + 1;
    if (reaching !== undefined && placed.channel.address < reach) {
      problems.push(
        problem(
          placed,
          "address",
          "address_overlap",
          `Address ${placed.channel.address} in zone ${placed.channel.zone} overlaps tag "${reaching.channel.tag}" (${reaching.channel.address}..${reach - 1}).`,
        ),
      );
    }
    if (reaching === undefined || lastAddressOf(placed.channel) + 1 > reach) {
      reaching = placed;
    }
  }
  return problems;
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
    module.channels.map((channel, channelIndex) => ({ channel, moduleIndex, channelIndex })),
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
    ...overlapProblems(placedChannels),
  ].sort((a, b) => comparePaths(a.path, b.path));
  const mapped = new Set(placedChannels.map(({ channel }) => channel.tag));
  const unmappedTags = tags
    .filter((tag) => !mapped.has(tag.name))
    .map(({ name, type, direction, owner }) => ({ name, type, direction, owner }));
  return { problems, unmappedTags };
}
