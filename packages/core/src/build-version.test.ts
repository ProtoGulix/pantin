import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BuildVersionError, formatBuildVersion, readBuildVersion } from "./build-version.ts";

describe("formatBuildVersion", () => {
  it("shows the package version on the commit that carries its tag", () => {
    expect(
      formatBuildVersion({ packageVersion: "0.2.0", exactTag: "v0.2.0", shortCommit: "8b4e4c4" }),
    ).toBe("0.2.0");
  });

  it("adds the short commit when the commit has no tag", () => {
    expect(
      formatBuildVersion({ packageVersion: "0.2.0", exactTag: undefined, shortCommit: "8b4e4c4" }),
    ).toBe("0.2.0+8b4e4c4");
  });

  it("adds the short commit when the tag is another version's", () => {
    expect(
      formatBuildVersion({ packageVersion: "0.2.0", exactTag: "v0.1.0", shortCommit: "8b4e4c4" }),
    ).toBe("0.2.0+8b4e4c4");
  });

  it("shows the package version alone without git", () => {
    expect(
      formatBuildVersion({ packageVersion: "0.2.0", exactTag: undefined, shortCommit: undefined }),
    ).toBe("0.2.0");
  });
});

describe("readBuildVersion", () => {
  const folders: string[] = [];
  afterEach(() => {
    for (const folder of folders.splice(0)) {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  function folderWithCorePackage(contents: string): string {
    const root = mkdtempSync(join(tmpdir(), "pantin-build-version-"));
    folders.push(root);
    mkdirSync(join(root, "packages", "core"), { recursive: true });
    writeFileSync(join(root, "packages", "core", "package.json"), contents);
    return root;
  }

  // An archive of the sources has no .git: the package version alone.
  it("gives the package version alone outside a git repository", () => {
    const root = folderWithCorePackage(JSON.stringify({ version: "0.2.0" }));
    expect(readBuildVersion(root)).toBe("0.2.0");
  });

  it("names the file when the version cannot be read", () => {
    const root = folderWithCorePackage(JSON.stringify({ name: "@pantin/core" }));
    expect(() => readBuildVersion(root)).toThrow(BuildVersionError);
    expect(() => readBuildVersion(root)).toThrow(/packages\/core\/package\.json/);
  });
});
