import { PantinIdSchema } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { defaultLogsDirectory, defaultPantinsDirectory } from "./default-directories.ts";

describe("default directories", () => {
  it("puts the Pantins in pantin-projects of the home and the logs in .logs under them", () => {
    expect(defaultPantinsDirectory("/home/ann")).toBe("/home/ann/pantin-projects");
    expect(defaultLogsDirectory("/data/pantins")).toBe("/data/pantins/.logs");
  });

  it("names the logs folder so that it can never be a Pantin id", () => {
    expect(PantinIdSchema.safeParse(".logs").success).toBe(false);
  });
});
