import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCommand } from "./cli.ts";

// The command's contract: what goes to stdout and stderr, and the exit code.

const EXAMPLE = fileURLToPath(new URL("../../../examples/axis", import.meta.url));

async function run(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCommand(args, {
    stdout: { write: (text) => stdout.push(text) },
    stderr: { write: (text) => stderr.push(text) },
  });
  return { code, stdout: stdout.join(""), stderr: stderr.join("") };
}

describe("pantin command", () => {
  it("validates a folder: exit 0 and a line on stdout", async () => {
    expect(await run(["validate", EXAMPLE])).toEqual({
      code: 0,
      stdout: `${EXAMPLE}: valid Pantin.\n`,
      stderr: "",
    });
  });

  it("reports problems on stderr with exit 1", async () => {
    const result = await run(["validate", "/no/such/pantin"]);
    expect([result.code, result.stdout]).toEqual([1, ""]);
    expect(result.stderr).toMatch(/^error: Cannot read .*Is this a Pantin folder\?\n$/);
  });

  it("prints the JSON Schema", async () => {
    const result = await run(["schema"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ title: "Pantin document (pantin.json)" });
  });

  it.each([[[]], [["validate"]], [["validate", "a", "b"]], [["schema", "x"]], [["help"]]])(
    "shows the usage with exit 2 for %j",
    async (args) => {
      const result = await run(args);
      expect([result.code, result.stdout]).toEqual([2, ""]);
      expect(result.stderr).toMatch(/^Usage: pnpm pantin <command>/);
    },
  );
});
