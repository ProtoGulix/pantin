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
      "network-address",
      "opcua-bridge",
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

describe("the closed-loop test package", () => {
  const folder = join(repositoryRoot, "tests", "closed-loop");

  it("is a private workspace package listed in the workspace file and the root project", () => {
    expect(readJson(join(folder, "package.json"))).toMatchObject({
      name: "@pantin/closed-loop-tests",
      private: true,
      license: "Apache-2.0",
      type: "module",
    });
    expect(readFileSync(join(repositoryRoot, "pnpm-workspace.yaml"), "utf8")).toContain(
      "tests/closed-loop",
    );
    expect(readJson(join(repositoryRoot, "tsconfig.json"))).toMatchObject({
      references: expect.arrayContaining([{ path: "tests/closed-loop" }]),
    });
  });

  it("depends on the protocol alone among the workspace packages", () => {
    const manifest = readJson(join(folder, "package.json")) as {
      dependencies: Record<string, string>;
    }; // Our own manifest, read in a test: the shape is checked by the assertions below.

    expect(Object.keys(manifest.dependencies)).toEqual(["@pantin/protocol"]);
  });
});
