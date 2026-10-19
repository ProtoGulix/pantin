import { VersionResponseSchema } from "@pantin/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CylinderAxis, startCylinderAxis } from "../test-support/cylinder-axis.ts";
import { sendRaw } from "../test-support/test-server.ts";

let axis: CylinderAxis;

beforeEach(async () => {
  axis = await startCylinderAxis();
});

afterEach(async () => {
  await axis.close();
});

describe("GET /api/version", () => {
  it("answers the build version the server was started with", async () => {
    const response = await sendRaw(axis.server, "GET", "/api/version");
    expect(response.status).toBe(200);
    expect(VersionResponseSchema.parse(response.json)).toEqual({ version: "0.0.0-test" });
  });

  it("refuses other methods", async () => {
    const response = await sendRaw(axis.server, "POST", "/api/version");
    expect(response.status).toBe(405);
  });
});
