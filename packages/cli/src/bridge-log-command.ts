import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  bridgeLogFileName,
  bridgeLogRotatedFileName,
  defaultLogsDirectory,
  defaultPantinsDirectory,
} from "@pantin/core";
import {
  PantinIdSchema,
  TRANSPORT_KINDS,
  type TransportKind,
  TransportKindSchema,
} from "@pantin/protocol";
import { type FollowClock, followLogFile, type LogFileReader } from "./bridge-log-follow.ts";
import type { CommandResult } from "./command-result.ts";

// pantin bridge-log <pantinId> [--transport <kind>] [--logs-dir <dir>] [--pantins-dir <dir>]
// [--follow] (ADR 0054 point 4, ADR 0065 point 7): prints the bridge log file of one kind,
// read directly from disk, so it works with the core stopped.

export type BridgeLogEnvironment = {
  homeDirectory: string;
  reader: LogFileReader;
  // Only used with --follow.
  clock: FollowClock;
};

export const BRIDGE_LOG_USAGE =
  "  bridge-log <pantinId> [--transport <kind>] [--logs-dir <dir>] [--pantins-dir <dir>] [--follow]\n" +
  "                      print the bridge log of a Pantin, read from the core's logs folder;\n" +
  `                      --transport (${TRANSPORT_KINDS.join(" or ")}) is needed when several exist`;

type Parsed = {
  pantinId: string;
  transport?: string;
  logsDirectory?: string;
  pantinsDirectory?: string;
  follow: boolean;
};

function parseBridgeLogArguments(args: readonly string[]): Parsed | undefined {
  try {
    const { values, positionals } = parseArgs({
      args: [...args],
      options: {
        transport: { type: "string" },
        "logs-dir": { type: "string" },
        "pantins-dir": { type: "string" },
        follow: { type: "boolean" },
      },
      allowPositionals: true,
      strict: true,
    });
    const [pantinId, ...extra] = positionals;
    if (pantinId === undefined || extra.length > 0) {
      return undefined;
    }
    return {
      pantinId,
      follow: values.follow === true,
      ...(values.transport === undefined ? {} : { transport: values.transport }),
      ...(values["logs-dir"] === undefined ? {} : { logsDirectory: values["logs-dir"] }),
      ...(values["pantins-dir"] === undefined ? {} : { pantinsDirectory: values["pantins-dir"] }),
    };
  } catch {
    return undefined;
  }
}

type KindChoice = { kind: TransportKind } | { error: string };

// The kind to read: the one asked for, else the only one with a file (ADR 0065 point 7).
function chooseLogKind(
  requested: string | undefined,
  existing: readonly { kind: TransportKind; path: string }[],
  pantinId: string,
): KindChoice {
  if (requested !== undefined) {
    const kind = TransportKindSchema.safeParse(requested);
    return kind.success
      ? { kind: kind.data }
      : {
          error: `Unknown transport "${requested}": the known ones are ${TRANSPORT_KINDS.join(", ")}.`,
        };
  }
  const [only, ...others] = existing;
  if (only !== undefined && others.length === 0) {
    return { kind: only.kind };
  }
  if (only === undefined) {
    return {
      error: `No bridge log for "${pantinId}" in the logs folder. Start a bridge of "${pantinId}" from the viewer first, check --logs-dir and --pantins-dir, or name the one to wait for with --transport ${TRANSPORT_KINDS.join(" or ")} (with --follow).`,
    };
  }
  const listed = existing.map(({ kind, path }) => `${kind} (${path})`).join(", ");
  return {
    error: `Several bridge logs exist for "${pantinId}": ${listed}. Choose one with --transport <kind>.`,
  };
}

async function existingLogs(
  reader: LogFileReader,
  directory: string,
): Promise<{ kind: TransportKind; path: string }[]> {
  const found: { kind: TransportKind; path: string }[] = [];
  for (const kind of TRANSPORT_KINDS) {
    const path = join(directory, bridgeLogFileName(kind));
    if ((await reader.sizeOf(path)) !== undefined) {
      found.push({ kind, path });
    }
  }
  return found;
}

function failure(error: string): CommandResult {
  return { exitCode: 1, messages: [], errors: [error] };
}

function logsDirectoryOf(parsed: Parsed, homeDirectory: string): string {
  return resolve(
    parsed.logsDirectory ??
      defaultLogsDirectory(
        resolve(parsed.pantinsDirectory ?? defaultPantinsDirectory(homeDirectory)),
      ),
  );
}

/** undefined when the arguments are not valid: the caller prints the usage. */
export async function bridgeLog(
  args: readonly string[],
  environment: BridgeLogEnvironment,
  print: (text: string) => void,
): Promise<CommandResult | undefined> {
  const parsed = parseBridgeLogArguments(args);
  if (parsed === undefined) {
    return undefined;
  }
  const id = PantinIdSchema.safeParse(parsed.pantinId);
  if (!id.success) {
    return failure(`"${parsed.pantinId}" is not a Pantin id.`);
  }
  const { reader, clock } = environment;
  const pantinDirectory = join(logsDirectoryOf(parsed, environment.homeDirectory), id.data);
  const choice = chooseLogKind(
    parsed.transport,
    await existingLogs(reader, pantinDirectory),
    id.data,
  );
  if ("error" in choice) {
    return failure(choice.error);
  }
  const paths = {
    current: join(pantinDirectory, bridgeLogFileName(choice.kind)),
    rotated: join(pantinDirectory, bridgeLogRotatedFileName(choice.kind)),
  };
  if (!parsed.follow && (await reader.sizeOf(paths.current)) === undefined) {
    return failure(
      `No ${choice.kind} bridge log at ${paths.current}. Start that bridge of "${id.data}" from the viewer first, or check --logs-dir and --pantins-dir.`,
    );
  }
  await followLogFile(
    paths,
    reader,
    parsed.follow ? clock : { ...clock, shouldContinue: () => false },
    print,
  );
  return { exitCode: 0, messages: [], errors: [] };
}
