import { cp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyAxisWithValve, runCli, tmpWorkspace } from "./io-test-folder.ts";

// ADR 0049 point 9: `pantin gvl` keeps its output format when it moves from
// io.csv to io.json. The fixture holds one mapping twice, as the legacy pair
// and as io.json, and `expected.gvl`, the text the CSV based command printed
// for the pair (generated with it before this change). Two modules, listed
// in this order, show that modules keep the file order and channels the
// canonical order.

const FIXTURE = fileURLToPath(new URL("../fixtures/gvl-equivalence/", import.meta.url));

let workspace: string;
let folder: string;

beforeEach(async () => {
  workspace = await tmpWorkspace();
  folder = await copyAxisWithValve(workspace);
});

afterEach(async () => {
  await rm(workspace, { recursive: true });
});

// The only line that changed is the one naming the source files.
async function expectedGvl(): Promise<string> {
  const before = await readFile(join(FIXTURE, "expected.gvl"), "utf8");
  return before.replace("from io.csv and io-modules.json", "from io.json");
}

describe("pantin gvl, before and after the move to io.json", () => {
  it("prints the same GVL for the equivalent io.json", async () => {
    await cp(join(FIXTURE, "io.json"), join(folder, "io.json"));
    expect(await runCli(["gvl", folder])).toEqual({
      code: 0,
      stdout: await expectedGvl(),
      stderr: "",
    });
  });

  it("prints the same GVL for the legacy pair once migrated", async () => {
    await cp(join(FIXTURE, "io.csv"), join(folder, "io.csv"));
    await cp(join(FIXTURE, "io-modules.json"), join(folder, "io-modules.json"));
    expect((await runCli(["io", "migrate", folder])).code).toBe(0);
    expect(await runCli(["gvl", folder])).toEqual({
      code: 0,
      stdout: await expectedGvl(),
      stderr: "",
    });
    expect(await readFile(join(folder, "io.json"), "utf8")).toBe(
      await readFile(join(FIXTURE, "io.json"), "utf8"),
    );
  });
});
