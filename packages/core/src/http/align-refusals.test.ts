import { rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BASE_FACES, face, useAlignmentBench } from "../test-support/alignment-bench.ts";
import { sendJsonRequest } from "../test-support/test-server.ts";

// What an alignment refuses (ADR 0035 points 6 and 10).

const { align, server, workspace } = useAlignmentBench();

describe("POST .../align on a body without a usable face file", () => {
  const facePick = {
    kind: "plane_on_plane",
    picks: [face("block", 0, [0, 0, 0]), face("base", 0, [0.3, 0.2, 0.1])],
  };
  const baseFaceFile = () =>
    join(workspace().pantinsDirectory, "bench", "meshes", "base.faces.json");

  it.each<[string, () => Promise<void>]>([
    ["missing", () => rm(baseFaceFile())],
    ["damaged", () => writeFile(baseFaceFile(), "{ not json")],
    [
      "a symbolic link",
      async () => {
        await rm(baseFaceFile());
        await writeFile(join(workspace().root, "elsewhere.json"), JSON.stringify(BASE_FACES));
        await symlink(join(workspace().root, "elsewhere.json"), baseFaceFile());
      },
    ],
  ])("refuses a face pick when the face file is %s", async (_case, spoil) => {
    await spoil();
    const response = await align(facePick);
    expect(response.status).toBe(400);
    expect(response.json).toMatchObject({
      error: { message: expect.stringMatching(/has no face file/) },
    });
  });
});

const REFUSALS: [string, unknown, number][] = [
  [
    "a target on the moving assembly",
    { kind: "plane_on_plane", picks: [face("block", 0, [0, 0, 0]), face("block", 0, [0, 0, 0])] },
    409,
  ],
  [
    "a moving pick off the moving assembly",
    { kind: "plane_on_plane", picks: [face("base", 0, [0, 0, 0]), face("base", 0, [0, 0, 0])] },
    400,
  ],
  [
    "an axis picked without a face file",
    {
      kind: "axis_on_axis",
      picks: [
        face("block", 1, [0, 0, 0]),
        { kind: "plane", body: "base", point: [0, 0, 0], normal: [0, 0, 1] },
      ],
    },
    400,
  ],
  [
    "a plane where a cylinder is needed",
    { kind: "axis_on_axis", picks: [face("block", 0, [0, 0, 0]), face("base", 1, [0, 0, 0])] },
    400,
  ],
  [
    "a face the face file does not have",
    { kind: "plane_on_plane", picks: [face("block", 9, [0, 0, 0]), face("base", 0, [0, 0, 0])] },
    400,
  ],
  [
    "a parameter the kind does not use",
    {
      kind: "axis_around_pivot",
      picks: [face("base", 1, [0, 0, 0]), face("block", 1, [0, 0, 0]), face("base", 2, [0, 0, 0])],
      offset: 0.01,
    },
    400,
  ],
  ["a missing pick", { kind: "plane_on_plane", picks: [face("block", 0, [0, 0, 0])] }, 400],
  [
    "an unknown body",
    { kind: "plane_on_plane", picks: [face("block", 0, [0, 0, 0]), face("ghost", 0, [0, 0, 0])] },
    404,
  ],
];

describe("POST .../align refusals", () => {
  it.each(REFUSALS)("refuses %s", async (_case, request, status) => {
    const response = await align(request);
    expect(response.status).toBe(status);
  });

  it("answers 404 for an unknown assembly", async () => {
    const response = await sendJsonRequest(
      server(),
      "POST",
      "/api/pantins/bench/assemblies/ghost/align",
      { kind: "plane_on_plane", picks: [face("block", 0, [0, 0, 0]), face("base", 0, [0, 0, 0])] },
    );
    expect(response.status).toBe(404);
  });
});
