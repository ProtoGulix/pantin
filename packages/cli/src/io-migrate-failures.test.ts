import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyAxisWithValve, runCli, tmpWorkspace } from "./io-test-folder.ts";
import { IO_LIST_HEADER } from "./legacy-csv/legacy-types.ts";

// pantin io migrate when the file system fails (ADR 0049 point 8): every
// error is a sentence, never a stack trace, and io.json is never half written.

const failures = vi.hoisted(() => ({ removing: "", linking: false }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    rm: (path: string, options?: Parameters<typeof original.rm>[1]) =>
      failures.removing !== "" && path.endsWith(failures.removing)
        ? Promise.reject(new Error("EPERM: operation not permitted"))
        : original.rm(path, options),
    link: (existing: string, created: string) =>
      failures.linking
        ? Promise.reject(
            Object.assign(new Error("EEXIST: file already exists"), { code: "EEXIST" }),
          )
        : original.link(existing, created),
  };
});

let workspace: string;
let folder: string;

beforeEach(async () => {
  failures.removing = "";
  failures.linking = false;
  workspace = await tmpWorkspace();
  folder = await copyAxisWithValve(workspace);
  await writeFile(join(folder, "io.csv"), `${IO_LIST_HEADER}\n`);
  await writeFile(
    join(folder, "io-modules.json"),
    JSON.stringify({ schema_version: 1, modules: [{ key: "m1", port: 1502 }] }),
  );
});

afterEach(async () => {
  await rm(workspace, { recursive: true });
});

describe("pantin io migrate, file system failures", () => {
  it("says to delete a legacy file by hand when it cannot be removed, and exits 1", async () => {
    failures.removing = "io-modules.json";
    const result = await runCli(["io", "migrate", folder]);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      "error: io.json written; delete io-modules.json by hand (removal failed): the core reports them until then.\n",
    );
    expect(JSON.parse(await readFile(join(folder, "io.json"), "utf8")).modules).toHaveLength(1);
  });

  it("explains a legacy file that cannot be read, without a stack trace", async () => {
    await rm(join(folder, "io.csv"));
    await mkdir(join(folder, "io.csv"));
    const result = await runCli(["io", "migrate", folder]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^error: .*io\.csv cannot be read \(.*\): fix it/);
    expect(result.stderr).not.toContain("    at ");
  });

  it("answers like the existing-file refusal when io.json appears during the write, leaving no temporary file", async () => {
    failures.linking = true;
    const result = await runCli(["io", "migrate", folder]);
    expect([result.code, result.stderr]).toEqual([1, expect.stringContaining("never overwrites")]);
    const { readdir } = await import("node:fs/promises");
    expect((await readdir(folder)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    expect(await readFile(join(folder, "io.csv"), "utf8")).toBe(`${IO_LIST_HEADER}\n`);
  });
});
