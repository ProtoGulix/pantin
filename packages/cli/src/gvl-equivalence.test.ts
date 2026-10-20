import { cp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyAxisWithValve, runCli, tmpWorkspace } from "./io-test-folder.ts";

// ADR 0049 point 9: `pantin gvl` keeps the output format it had when it read
// io.csv. `expected.gvl` is the text that command printed for the mapping held
// by io.json (generated before the move). Two modules, listed in this order,
// show that modules keep the file order and channels the canonical order.

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
});
