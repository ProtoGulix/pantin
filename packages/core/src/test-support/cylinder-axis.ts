import { TagListResponseSchema } from "@pantin/protocol";
import { STEP_SECONDS } from "../domain/fixed-step.ts";
import type { RunningPantinServer } from "../http/server.ts";
import { createManualTimer, type ManualTimer } from "./manual-timer.ts";
import { buildAsciiStl } from "./mesh-fixtures.ts";
import {
  createTestWorkspace,
  importMesh,
  type RawResponse,
  sendJsonRequest,
  sendRaw,
  startTestServer,
  type TestWorkspace,
} from "./test-server.ts";

// A Pantin "axis" with a 100 mm stroke (rail to carriage) moved by a
// double-acting valve, on a manual clock: the drive tests of phase 4.

export const VALVE = {
  name: "Valve",
  assembly: "carriage",
  joints: ["stroke"],
  type: "double_acting_cylinder",
  speed: 0.2,
};

export interface CylinderAxis {
  server: RunningPantinServer;
  close(): Promise<void>;
  // One tick per step: the loop catches up at most 12 steps per tick (ADR 0012).
  runSeconds(seconds: number): void;
  writeTag(name: string, value: number): Promise<RawResponse>;
  strokePosition(): Promise<number>;
  tagNames(): Promise<string[]>;
}

export async function startCylinderAxis(): Promise<CylinderAxis> {
  const workspace: TestWorkspace = await createTestWorkspace();
  const clock: ManualTimer = createManualTimer();
  const server = await startTestServer(workspace.pantinsDirectory, {
    simulationTimer: clock.timer,
  });
  await sendJsonRequest(server, "POST", "/api/pantins", { name: "Axis" });
  await importMesh(server, "axis", "fileName=rail.stl&unit=mm", buildAsciiStl());
  await importMesh(server, "axis", "fileName=carriage.stl&unit=mm", buildAsciiStl());
  await sendJsonRequest(server, "POST", "/api/pantins/axis/joints", {
    type: "prismatic",
    name: "Stroke",
    parent: "rail",
    child: "carriage",
    origin: [0, 0, 0],
    axis: [1, 0, 0],
    limits: [0, 0.1],
  });
  await sendJsonRequest(server, "POST", "/api/pantins/axis/drives", VALVE);
  const tags = async () =>
    TagListResponseSchema.parse((await sendRaw(server, "GET", "/api/pantins/axis/tags")).json).tags;
  return {
    server,
    close: async () => {
      await server.close();
      await workspace.remove();
    },
    runSeconds: (seconds) => {
      for (let step = 0; step < Math.round(seconds / STEP_SECONDS); step += 1) {
        clock.advance(STEP_SECONDS);
      }
    },
    writeTag: (name, value) =>
      sendJsonRequest(server, "PUT", `/api/pantins/axis/tags/${name}`, { value }),
    strokePosition: async () =>
      (await tags()).find((tag) => tag.name === "carriage.stroke.position")?.value ?? Number.NaN,
    tagNames: async () => (await tags()).map((tag) => tag.name),
  };
}
