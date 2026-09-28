import { describe, expect, it } from "vitest";
import { resolveInside } from "../store/safe-paths.ts";
import { matchPattern, parseRequestTarget } from "./route-matching.ts";

describe("parseRequestTarget", () => {
  it("decodes each segment separately so encoded slashes stay in one segment", () => {
    const { segments, query } = parseRequestTarget("/api/pantins/..%2F..%2Fetc?fileName=a%20b.stl");
    expect(segments).toEqual(["api", "pantins", "../../etc"]);
    expect(query.get("fileName")).toBe("a b.stl");
  });

  it("rejects a malformed escape", () => {
    expect(() => parseRequestTarget("/api/%E0%A4%A")).toThrow(/not correctly encoded/);
  });
});

describe("matchPattern", () => {
  it("captures parameters and refuses other shapes", () => {
    const pattern = ["pantins", ":pantinId", "bodies", ":bodyId"];
    expect(matchPattern(pattern, ["pantins", "p", "bodies", "b"])).toEqual({
      pantinId: "p",
      bodyId: "b",
    });
    expect(matchPattern(pattern, ["pantins", "p", "meshes", "b"])).toBeUndefined();
    expect(matchPattern(pattern, ["pantins", "p"])).toBeUndefined();
  });
});

describe("resolveInside", () => {
  it("accepts paths inside the base directory", () => {
    expect(resolveInside("/data/pantins", "axe", "meshes/rail.glb")).toBe(
      "/data/pantins/axe/meshes/rail.glb",
    );
  });

  it.each([["../etc"], ["axe/../../etc"], ["/etc/passwd"], ["../pantins-evil"]])(
    "refuses %s",
    (segment) => {
      expect(() => resolveInside("/data/pantins", segment)).toThrow(/leaves the pantins directory/);
    },
  );
});
