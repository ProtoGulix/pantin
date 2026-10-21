import { realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { OPCUA_CLIENT_KIND } from "@pantin/protocol";
import type { BridgeLauncher } from "./bridge-supervisor-context.ts";

// The OPC UA bridge as a program (ADR 0065 points 5 and 10): the Node entry file given to
// the core with --opcua-bridge, the host-wide PKI folder, and the environment its child gets.

// Nothing else is inherited, so NODE_OPTIONS, NODE_PATH, NODEOPCUA* and proxy variables
// never reach a child that holds the PLC's passwords.
const ENVIRONMENT_ALLOWLIST = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "LANG",
  "LC_ALL",
  "TZ",
  "TMPDIR",
  "TEMP",
  "TMP",
  "SystemRoot",
  "XDG_STATE_HOME",
] as const;

export function allowlistedEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const name of ENVIRONMENT_ALLOWLIST) {
    const value = source[name];
    if (value !== undefined) {
      environment[name] = value;
    }
  }
  return environment;
}

/**
 * `$XDG_STATE_HOME/pantin/opcua-pki`, else `~/.local/state/pantin/opcua-pki`. A relative
 * XDG_STATE_HOME is ignored, as the XDG specification says.
 */
export function defaultPkiDirectory(
  environment: Readonly<Record<string, string | undefined>>,
  homeDirectory: string,
): string {
  const stateHome = environment.XDG_STATE_HOME;
  const base =
    stateHome !== undefined && isAbsolute(stateHome)
      ? stateHome
      : join(homeDirectory, ".local", "state");
  return join(base, "pantin", "opcua-pki");
}

export function opcuaLauncherOf(options: {
  nodePath: string;
  entryPath: string;
  pkiDirectory: string;
  environment: Readonly<Record<string, string>>;
}): BridgeLauncher {
  return {
    kind: OPCUA_CLIENT_KIND,
    command: options.nodePath,
    args: [options.entryPath],
    hostArguments: ["--pki-dir", options.pkiDirectory],
    environment: options.environment,
  };
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

// The real path of a folder that may not exist yet: the real path of its nearest existing
// ancestor, then the missing names. A symbolic link above it is followed, as it would be
// when the bridge creates the folder.
export async function realPathOfFutureFolder(path: string): Promise<string> {
  const missingNames: string[] = [];
  let current = resolve(path);
  for (;;) {
    try {
      return join(await realpath(current), ...missingNames);
    } catch (error) {
      if (!isMissing(error) || dirname(current) === current) {
        throw error;
      }
      missingNames.unshift(basename(current));
      current = dirname(current);
    }
  }
}

function isInside(folder: string, candidate: string): boolean {
  const path = relative(folder, candidate);
  // A name like "..pki" is inside; only ".." as a whole segment leaves the folder.
  const leaves = path === ".." || path.startsWith(`..${sep}`);
  return !leaves && !isAbsolute(path);
}

export type OpcuaLauncherResult =
  | { ok: true; launcher: BridgeLauncher | undefined }
  | { ok: false; message: string };

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isFile(),
    (error: unknown) => {
      if (isMissing(error)) {
        return false;
      }
      throw error;
    },
  );
}

/**
 * Checks what the user gave at start-up. Without `--opcua-bridge` the kind has no launcher
 * (`unavailable`). A PKI folder inside the Pantins folder is refused: the Pantins folder is
 * shared and versioned, and the PKI holds Pantin's private key and the trust decisions.
 */
export async function resolveOpcuaLauncher(options: {
  entryOption: string | undefined;
  pkiOption: string | undefined;
  pantinsDirectory: string;
  nodePath: string;
  environment: Readonly<Record<string, string | undefined>>;
  homeDirectory: string;
}): Promise<OpcuaLauncherResult> {
  if (options.entryOption === undefined) {
    return { ok: true, launcher: undefined };
  }
  const entryPath = resolve(options.entryOption);
  if (!(await isFile(entryPath))) {
    return {
      ok: false,
      message: `--opcua-bridge "${entryPath}" is not a file. Give the entry file of the OPC UA bridge.`,
    };
  }
  const pkiDirectory = resolve(
    options.pkiOption ?? defaultPkiDirectory(options.environment, options.homeDirectory),
  );
  const [pkiReal, pantinsReal] = await Promise.all([
    realPathOfFutureFolder(pkiDirectory),
    realPathOfFutureFolder(options.pantinsDirectory),
  ]);
  if (isInside(pantinsReal, pkiReal)) {
    return {
      ok: false,
      message: `--opcua-pki-dir "${pkiDirectory}" is inside the Pantins folder "${options.pantinsDirectory}": it would share Pantin's private key. Choose a folder outside it.`,
    };
  }
  const launcher = opcuaLauncherOf({
    nodePath: options.nodePath,
    entryPath,
    pkiDirectory,
    environment: allowlistedEnvironment(options.environment),
  });
  return { ok: true, launcher };
}
