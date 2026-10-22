import { type BridgeStatusLine, BridgeStatusLineSchema } from "@pantin/protocol";
import { afterEach } from "vitest";
import { type RunningBridge, runBridgeProcess } from "./bridge-process.ts";
import { type FakeCore, startFakeCore } from "./fake-core.ts";
import { type FixtureModule, opcuaProjection } from "./projection-fixtures.ts";

// A bridge process against a fake core, for the tests that need the whole program: its exit
// code, its status lines, its sockets. The core and the child are stopped after each test.

export type ScenarioOptions = {
  pkiDirectory: string;
  /** The port of the PLC server (the test one is on 127.0.0.1). */
  port: number;
  module?: Omit<FixtureModule, "key" | "port">;
  password?: string;
  /** SHA-256 thumbprints given as `--trust`. */
  trust?: readonly string[];
};

export type Scenario = { bridge: RunningBridge; core: FakeCore };

const running: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((stop) => stop()));
});

export async function startScenario(options: ScenarioOptions): Promise<Scenario> {
  const core = await startFakeCore({
    projection: opcuaProjection([{ key: "plc", ...options.module, port: options.port }]),
  });
  const passwords = options.password === undefined ? {} : { plc: options.password };
  const bridge = runBridgeProcess(
    [
      "--status-lines",
      "--core",
      core.url,
      "--pantin",
      "press",
      "--pki-dir",
      options.pkiDirectory,
      "--target",
      "plc=127.0.0.1",
      ...(options.trust ?? []).flatMap((sha256) => ["--trust", sha256]),
    ],
    { stdinText: `${JSON.stringify({ passwords })}\n` },
  );
  running.push(async () => {
    bridge.child.kill("SIGKILL");
    await bridge.exited;
    await core.close();
  });
  return { bridge, core };
}

/** The `exiting` line of a finished bridge; fails the test when there is none. */
export function exitingLineOf(
  bridge: RunningBridge,
): Extract<BridgeStatusLine, { event: "exiting" }> {
  for (const line of bridge.stdout) {
    const parsed = BridgeStatusLineSchema.parse(JSON.parse(line));
    if (parsed.event === "exiting") {
      return parsed;
    }
  }
  throw new Error(`The bridge wrote no exiting line. Its stderr: ${bridge.stderr.join("\n")}`);
}
