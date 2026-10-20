import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { type ProcessLimits, runProcess } from "./process-runner.ts";

const LIMITS: ProcessLimits = { timeLimitMs: 10_000, killGraceMs: 200, maxOutputBytes: 100_000 };

// The grandchild inherits the pipes and outlives the child.
const CHILD_LEAVING_A_GRANDCHILD = `
  const { spawn } = require("node:child_process");
  spawn(process.execPath, ["-e", "setTimeout(() => undefined, 3000)"], { stdio: "inherit" }).unref();
  process.stdout.write("done");
`;

describe("runProcess", () => {
  it("returns the output of a normal run", async () => {
    const outcome = await runProcess(
      spawn,
      process.execPath,
      ["-e", "process.stdout.write('hi')"],
      LIMITS,
    );
    expect(outcome).toMatchObject({ exitCode: 0, stdout: "hi", timedOut: false });
  });

  it("does not hang when a grandchild keeps the pipes open after the child exited", async () => {
    const started = Date.now();
    const outcome = await runProcess(
      spawn,
      process.execPath,
      ["-e", CHILD_LEAVING_A_GRANDCHILD],
      LIMITS,
    );
    expect(outcome).toMatchObject({ exitCode: 0, stdout: "done" });
    expect(Date.now() - started).toBeLessThan(2500);
  });

  it("does not hang when a grandchild keeps the pipes open after a kill on timeout", async () => {
    const script = `${CHILD_LEAVING_A_GRANDCHILD.replace('process.stdout.write("done");', "setInterval(() => undefined, 1000);")}`;
    const started = Date.now();
    const outcome = await runProcess(spawn, process.execPath, ["-e", script], {
      ...LIMITS,
      timeLimitMs: 300,
    });
    expect(outcome.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(2500);
  });
});
