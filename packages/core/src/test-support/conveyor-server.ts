import {
  PantinResponseSchema,
  type PoseResponse,
  PoseResponseSchema,
  TagListResponseSchema,
} from "@pantin/protocol";
import type { RunningPantinServer } from "../http/server.ts";
import { createManualTimer, type ManualTimer } from "./manual-timer.ts";
import { buildAsciiStl } from "./mesh-fixtures.ts";
import { testPhysicsWorldFactory } from "./physics-factory.ts";
import {
  createTestWorkspace,
  importMesh,
  type RawResponse,
  sendJsonRequest,
  sendRaw,
  startTestServer,
  type TestWorkspace,
} from "./test-server.ts";

// A Pantin "line" over REST with the real physics engine and a paused clock
// that tests step by hand (ADR 0032 point 3): assemblies "frame" and "roller"
// (their file names) with a continuous joint "drum" from the one to the other,
// ready for belts and the other phase 6 objects (ADR 0043).

export const LINE = "/api/pantins/line";

export const AT_ORIGIN = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };

export const BELT = {
  name: "Feed belt",
  assembly: "frame",
  placement: AT_ORIGIN,
  length: 1,
  width: 0.4,
  drumJoint: "drum",
  drumRadius: 0.05,
};

export const EMITTER = {
  name: "Source",
  assembly: "frame",
  placement: { translation: [-0.35, 0, 0], rotation: [0, 0, 0, 1] },
  box: { size: [0.1, 0.1, 0.1], mass: 1, material: "cardboard" },
};

export type ConveyorServer = {
  server: RunningPantinServer;
  timers: { simulation: ManualTimer; stream: ManualTimer };
  send(method: string, path: string, body?: unknown): Promise<RawResponse>;
  // Steps of the paused clock.
  step(steps: number): Promise<void>;
  pose(): Promise<PoseResponse>;
  tags(): Promise<Record<string, number>>;
  document(): Promise<ReturnType<typeof PantinResponseSchema.parse>["document"]>;
  close(): Promise<void>;
};

// The clock is paused unless `paused` is false; then only the manual timer moves it.
export async function startConveyorServer(paused = true): Promise<ConveyorServer> {
  const workspace: TestWorkspace = await createTestWorkspace();
  const timers = { simulation: createManualTimer(), stream: createManualTimer() };
  const server = await startTestServer(workspace.pantinsDirectory, {
    simulationTimer: timers.simulation.timer,
    streamTimer: timers.stream.timer,
    physicsWorldFactory: testPhysicsWorldFactory,
  });
  const send = (method: string, path: string, body?: unknown) =>
    body === undefined
      ? sendRaw(server, method, path)
      : sendJsonRequest(server, method, path, body);
  await send("POST", "/api/pantins", { name: "Line" });
  await importMesh(server, "line", "fileName=frame.stl&unit=mm", buildAsciiStl());
  await importMesh(server, "line", "fileName=roller.stl&unit=mm", buildAsciiStl());
  await send("POST", `${LINE}/joints`, {
    type: "continuous",
    name: "Drum",
    parent: "frame",
    child: "roller",
    origin: [0, 0, 0],
    axis: [0, 1, 0],
  });
  if (paused) {
    await send("PUT", `${LINE}/clock`, { running: false });
  }
  return {
    server,
    timers,
    send,
    step: async (steps) => {
      await send("POST", `${LINE}/clock/step`, { steps });
    },
    pose: async () => PoseResponseSchema.parse((await send("GET", `${LINE}/pose`)).json),
    tags: async () => {
      const { tags } = TagListResponseSchema.parse((await send("GET", `${LINE}/tags`)).json);
      return Object.fromEntries(tags.map((tag) => [tag.name, tag.value]));
    },
    document: async () => PantinResponseSchema.parse((await send("GET", LINE)).json).document,
    close: async () => {
      await server.close();
      await workspace.remove();
    },
  };
}
