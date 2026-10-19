import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  type PantinDocument,
  PantinResponseSchema,
  PoseResponseSchema,
  TagListResponseSchema,
} from "@pantin/protocol";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import type { RunningPantinServer } from "../http/server.ts";
import { MINIMAL_STEP_TEXT, writeFakeConverter } from "./fake-step-converter.ts";
import { createManualTimer, type ManualTimer } from "./manual-timer.ts";
import {
  createTestWorkspace,
  importMesh,
  sendJsonRequest,
  sendRaw,
  startTestServer,
  type TestWorkspace,
} from "./test-server.ts";

// A Pantin "axis" imported from a one-level STEP file (a plate, a rod and a
// tip in the assembly "machine", no joint: an import makes none inside an
// assembly, ADR 0055 point 10) on a manual clock: Grouper, Dégrouper and the
// phase 8 exit criterion run over HTTP against it. `withFixedJoints` adds the
// fixed joints "rod" and "tip" from the plate, as an older Pantin holds them.

export const PANTIN_URL = "/api/pantins/axis";

export type GroupedMachine = {
  workspace: TestWorkspace;
  clock: ManualTimer;
  server: RunningPantinServer;
  // Another server over the same folder, as after a restart of the core.
  restart(): Promise<RunningPantinServer>;
  close(): Promise<void>;
};

export async function startGroupedMachine(withFixedJoints = false): Promise<GroupedMachine> {
  const workspace = await createTestWorkspace();
  const converterDirectory = join(workspace.root, "converter");
  await mkdir(converterDirectory);
  const stepConverterPython = await writeFakeConverter(converterDirectory, "threeComponents");
  const clock = createManualTimer();
  const servers: RunningPantinServer[] = [];
  const start = async () => {
    const server = await startTestServer(workspace.pantinsDirectory, {
      stepConverterPython,
      simulationTimer: clock.timer,
    });
    servers.push(server);
    return server;
  };
  const server = await start();
  await sendJsonRequest(server, "POST", "/api/pantins", { name: "Axis" });
  const bytes = new TextEncoder().encode(MINIMAL_STEP_TEXT);
  await importMesh(server, "axis", "fileName=machine.stp", bytes);
  if (withFixedJoints) {
    await addFixedJointsFromPlate(server);
  }
  return {
    workspace,
    clock,
    server,
    restart: start,
    close: async () => {
      await Promise.all(servers.map((running) => running.close()));
      await workspace.remove();
    },
  };
}

async function addFixedJointsFromPlate(server: RunningPantinServer): Promise<void> {
  for (const [name, id] of [
    ["rod", "rod"],
    ["tip", "tip"],
  ] as const) {
    const created = await sendJsonRequest(server, "POST", `${PANTIN_URL}/joints`, {
      type: "fixed",
      name,
      parent: { kind: "body", id: "plate" },
      child: { kind: "body", id },
      origin: [0, 0, 0],
      axis: [0, 0, 1],
    });
    if (created.status !== 201) {
      throw new Error(`The fixed joint "${name}" was not created: status ${created.status}.`);
    }
  }
}

export function runSeconds(clock: ManualTimer, seconds: number): void {
  for (let step = 0; step < Math.round(seconds / STEP_SECONDS); step += 1) {
    clock.advance(STEP_SECONDS);
  }
}

export async function documentOf(server: RunningPantinServer): Promise<PantinDocument> {
  const response = await sendRaw(server, "GET", PANTIN_URL);
  return PantinResponseSchema.parse(response.json).document;
}

export async function tagNamesOf(server: RunningPantinServer): Promise<string[]> {
  const response = await sendRaw(server, "GET", `${PANTIN_URL}/tags`);
  return TagListResponseSchema.parse(response.json).tags.map((tag) => tag.name);
}

/** Translation of every body, by id. */
export async function translationsOf(server: RunningPantinServer) {
  const response = await sendRaw(server, "GET", `${PANTIN_URL}/pose`);
  const { bodies } = PoseResponseSchema.parse(response.json);
  return new Map(bodies.map((pose) => [pose.bodyId, pose.translation]));
}
