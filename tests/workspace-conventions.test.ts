import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the repository conventions from CLAUDE.md so that a new package
// cannot silently drift from them.

const repositoryRoot = join(import.meta.dirname, "..");
const packagesDirectory = join(repositoryRoot, "packages");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

const allPackageFolderNames = readdirSync(packagesDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

// Python packages (the bridge, ADR 0007 and 0045; the STEP converter, ADR 0009) carry a pyproject.toml instead of a package.json.
const pythonPackageFolderNames = allPackageFolderNames.filter((folderName) =>
  existsSync(join(packagesDirectory, folderName, "pyproject.toml")),
);
const packageFolderNames = allPackageFolderNames.filter(
  (folderName) => !pythonPackageFolderNames.includes(folderName),
);

describe("workspace packages", () => {
  it("contains exactly the packages declared in CLAUDE.md", () => {
    expect(allPackageFolderNames).toEqual([
      "actuator-types",
      "bridge",
      "cli",
      "core",
      "drive-types",
      "plc-symbol-formats",
      "protocol",
      "sensor-types",
      "step-converter",
      "transport-types",
      "viewer",
    ]);
  });

  it("knows which packages are written in Python", () => {
    expect(pythonPackageFolderNames).toEqual(["bridge", "step-converter"]);
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
