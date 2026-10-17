import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  BRIDGE_LOG_FILE_NAME,
  BRIDGE_LOG_ROTATED_FILE_NAME,
  defaultLogsDirectory,
  defaultPantinsDirectory,
} from "@pantin/core";
import { PantinIdSchema } from "@pantin/protocol";
import { type FollowClock, followLogFile, type LogFileReader } from "./bridge-log-follow.ts";
import type { CommandResult } from "./command-result.ts";

// pantin bridge-log <pantinId> [--logs-dir <dir>] [--pantins-dir <dir>] [--follow]
// (ADR 0054 point 4): prints the bridge log file read directly from disk, so
// it works with the core stopped.

export type BridgeLogEnvironment = {
  homeDirectory: string;
  reader: LogFileReader;
  // Only used with --follow.
  clock: FollowClock;
};

export const BRIDGE_LOG_USAGE =
  "  bridge-log <pantinId> [--logs-dir <dir>] [--pantins-dir <dir>] [--follow]\n" +
  "                      print the bridge log of a Pantin, read from the core's logs folder";

type Parsed = {
  pantinId: string;
  logsDirectory?: string;
  pantinsDirectory?: string;
  follow: boolean;
};

function parseBridgeLogArguments(args: readonly string[]): Parsed | undefined {
  try {
    const { values, positionals } = parseArgs({
      args: [...args],
      options: {
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
      ...(values["logs-dir"] === undefined ? {} : { logsDirectory: values["logs-dir"] }),
      ...(values["pantins-dir"] === undefined ? {} : { pantinsDirectory: values["pantins-dir"] }),
    };
  } catch {
    return undefined;
  }
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
    return { exitCode: 1, messages: [], errors: [`"${parsed.pantinId}" is not a Pantin id.`] };
  }
  const logsDirectory = resolve(
    parsed.logsDirectory ??
      defaultLogsDirectory(
        resolve(parsed.pantinsDirectory ?? defaultPantinsDirectory(environment.homeDirectory)),
      ),
  );
  const paths = {
    current: join(logsDirectory, id.data, BRIDGE_LOG_FILE_NAME),
    rotated: join(logsDirectory, id.data, BRIDGE_LOG_ROTATED_FILE_NAME),
  };
  const { reader, clock } = environment;
  if (!parsed.follow && (await reader.sizeOf(paths.current)) === undefined) {
    return {
      exitCode: 1,
      messages: [],
      errors: [
        `No bridge log at ${paths.current}. Start the bridge of "${id.data}" from the viewer first, or check --logs-dir and --pantins-dir.`,
      ],
    };
  }
  await followLogFile(
    paths,
    reader,
    parsed.follow ? clock : { ...clock, shouldContinue: () => false },
    print,
  );
  return { exitCode: 0, messages: [], errors: [] };
}
