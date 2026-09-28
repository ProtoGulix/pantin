import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the repository conventions from CLAUDE.md so that a new package
// cannot silently drift from them.

const repositoryRoot = join(import.meta.dirname, "..");
const packagesDirectory = join(repositoryRoot, "packages");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

const packageFolderNames = readdirSync(packagesDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

describe("workspace packages", () => {
  it("contains exactly the packages declared in CLAUDE.md", () => {
    expect(packageFolderNames.sort()).toEqual(["bridge", "cli", "core", "protocol", "viewer"]);
  });

  it.each(packageFolderNames)("%s follows the package manifest conventions", (folderName) => {
    const manifest = readJson(join(packagesDirectory, folderName, "package.json"));

    expect(manifest).toMatchObject({
      name: `@pantin/${folderName}`,
      private: true,
      license: "Apache-2.0",
      type: "module",
    });
  });

  it.each(packageFolderNames)("%s is referenced by the root TypeScript project", (folderName) => {
    const rootTsconfig = readJson(join(repositoryRoot, "tsconfig.json"));

    expect(rootTsconfig).toMatchObject({
      references: expect.arrayContaining([{ path: `packages/${folderName}` }]),
    });
  });
});
