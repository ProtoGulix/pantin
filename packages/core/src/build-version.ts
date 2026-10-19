import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

// The one implementation of the build version (ADR 0058 point 2). It lives in
// core because core needs it at run time; the viewer's vite.config.ts and the
// guide's VitePress config import this file by relative path at build time
// (build tooling, outside the packages' own sources). It imports only node
// builtins and zod, so those configs load it without any workspace package.

// The workspace packages all share one version (ADR 0058 point 1); the root
// package.json has none, so core's is the reference.
const REFERENCE_PACKAGE_PATH = join("packages", "core", "package.json");

const PackageVersionSchema = z.object({ version: z.string().min(1) });

export type BuildVersionInputs = {
  packageVersion: string;
  // The tag on the current commit, undefined when it has none or git is absent.
  exactTag: string | undefined;
  // The current commit, undefined when git is absent.
  shortCommit: string | undefined;
};

// "0.2.0" on the tagged commit, "0.2.0+8b4e4c4" after it (SemVer build
// metadata), the package version alone without git.
export function formatBuildVersion(inputs: BuildVersionInputs): string {
  const { packageVersion, exactTag, shortCommit } = inputs;
  if (exactTag === `v${packageVersion}` || shortCommit === undefined) {
    return packageVersion;
  }
  return `${packageVersion}+${shortCommit}`;
}

// A failing git (not installed, an archive without .git) means "unknown".
function runGit(repositoryRoot: string, args: readonly string[]): string | undefined {
  try {
    const output = execFileSync("git", [...args], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return output === "" ? undefined : output;
  } catch {
    return undefined;
  }
}

export class BuildVersionError extends Error {
  constructor(packagePath: string, cause: unknown) {
    super(
      `Cannot read the Pantin version from ${packagePath}: it must exist and hold a "version" field.`,
      { cause },
    );
    this.name = "BuildVersionError";
  }
}

function readPackageVersion(repositoryRoot: string): string {
  const packagePath = join(repositoryRoot, REFERENCE_PACKAGE_PATH);
  try {
    const packageJson: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
    return PackageVersionSchema.parse(packageJson).version;
  } catch (error) {
    throw new BuildVersionError(packagePath, error);
  }
}

export function readBuildVersion(repositoryRoot: string): string {
  const version = readPackageVersion(repositoryRoot);
  return formatBuildVersion({
    packageVersion: version,
    exactTag: runGit(repositoryRoot, ["describe", "--tags", "--exact-match"]),
    shortCommit: runGit(repositoryRoot, ["rev-parse", "--short", "HEAD"]),
  });
}
