import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";

export type CoreOptions = {
  readonly repositoryRoot: string;
  readonly pantinsDirectory: string;
};

export type RunningCore = {
  readonly baseUrl: string;
  stop(): Promise<void>;
};

const STARTUP_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 200;

/** Asks the system for a free port; the small race before the core binds it is acceptable here. */
async function findFreePort(): Promise<number> {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  probe.close();
  if (address === null || typeof address === "string") {
    throw new Error("Could not read the port given by the system.");
  }
  return address.port;
}

async function isServing(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/pantins`);
    return response.ok;
  } catch {
    // The core is not listening yet: the caller keeps polling until its deadline.
    return false;
  }
}

async function waitUntilServing(baseUrl: string, child: ChildProcess, output: string[]) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`The core exited with code ${child.exitCode}:\n${output.join("")}`);
    }
    if (await isServing(baseUrl)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`The core did not answer within ${STARTUP_TIMEOUT_MS} ms:\n${output.join("")}`);
}

/** Starts a throwaway core on localhost with the viewer, the STEP converter and the bridge. */
export async function startCore(options: CoreOptions): Promise<RunningCore> {
  const { repositoryRoot, pantinsDirectory } = options;
  const port = await findFreePort();
  const child = spawn(
    "node",
    [
      "packages/core/src/main.ts",
      "--port",
      String(port),
      "--pantins-dir",
      pantinsDirectory,
      "--viewer-dir",
      "packages/viewer/dist",
      // The Home tab lists the examples only when the core is given their folder (ADR 0062).
      "--examples-dir",
      "examples",
      "--opcua-bridge",
      "packages/opcua-bridge/src/main.ts",
      "--bridge-python",
      "packages/bridge/.venv/bin/python",
      "--step-converter-python",
      "packages/step-converter/.venv/bin/python",
    ],
    { cwd: repositoryRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
  const output: string[] = [];
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));

  const baseUrl = `http://127.0.0.1:${port}`;
  const stop = async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
  };
  try {
    await waitUntilServing(baseUrl, child, output);
  } catch (error) {
    await stop();
    throw error;
  }
  return { baseUrl, stop };
}
