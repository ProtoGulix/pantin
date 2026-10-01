import type { DriveRuntime } from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { layoutChainDiagram } from "./chain-layout.ts";
import {
  actuatorOf,
  bodyOf,
  cylinderOf,
  documentOf,
  driveOf,
  encoderOf,
  jointOf,
} from "./diagram-fixtures.ts";
import { changedDiagnostics, diffSets, liveStateOf, socketKey } from "./diagram-live.ts";

const document = documentOf({
  assemblies: ["a"],
  bodies: [bodyOf("s1", "a")],
  joints: [jointOf("j1", "s1")],
  drives: [driveOf("v1", "a"), driveOf("m1", "a", "reversing_contactor")],
  actuators: [cylinderOf("c1", "a", "v1", ["j1"])],
  sensors: [encoderOf("e1", "a", "j1")],
});
const diagram = layoutChainDiagram(document, new Set(), "en");
const t = createTranslator("en");
const runtime = (...drives: DriveRuntime[]) => new Map(drives.map((drive) => [drive.id, drive]));
const live = (tags: [string, number][], drives: DriveRuntime[] = []) =>
  liveStateOf(diagram, document, { tags: new Map(tags), runtime: runtime(...drives) }, t);

describe("liveStateOf", () => {
  it("lights a command socket at 1 and leaves it dark at 0", () => {
    expect(live([["a.v1.coil_14", 1]]).litSockets).toEqual(
      new Set([socketKey("drive:v1", "tag:coil_14")]),
    );
    expect(live([["a.v1.coil_14", 0]]).litSockets.size).toBe(0);
  });

  it("lights the pneumatic edges of a port under pressure only", () => {
    const state = live(
      [],
      [{ id: "v1", ports: { port_4: "pressure", port_2: "exhaust" }, diagnostics: [] }],
    );
    const lit = diagram.edges.filter((edge) => state.litEdges.has(edge.id));
    expect(lit.map((edge) => edge.fromSocket)).toEqual(["out:port_4"]);
    expect(lit.every((edge) => edge.kind === "pneumatic")).toBe(true);
  });

  it("never lights a servo port, nor a stopped or unknown drive", () => {
    const servo = { setpoint: 1, maxSpeed: 1, maxAcceleration: 1 };
    const state = live([], [{ id: "v1", ports: { port_4: servo }, diagnostics: [] }]);
    expect(state.litEdges.size).toBe(0);
    expect(live([]).litEdges.size).toBe(0);
  });

  it("names the diagnostic of a drive, with the wording of its type", () => {
    const state = live([], [{ id: "v1", ports: {}, diagnostics: ["conflicting_commands"] }]);
    expect(state.diagnostics.get("drive:v1")?.[0]?.text).toContain("both coils");
    expect(state.diagnostics.has("drive:m1")).toBe(false);
  });
});

describe("changes", () => {
  it("diffSets lists what went on and off", () => {
    expect(diffSets(new Set(["a", "b"]), new Set(["b", "c"]))).toEqual({
      added: ["c"],
      removed: ["a"],
    });
  });

  it("changedDiagnostics reports a new warning and a cleared one, not an unchanged one", () => {
    const warning = live([], [{ id: "v1", ports: {}, diagnostics: ["conflicting_commands"] }]);
    const none = live([]);
    expect([...changedDiagnostics(none.diagnostics, warning.diagnostics).keys()]).toEqual([
      "drive:v1",
    ]);
    expect(changedDiagnostics(warning.diagnostics, warning.diagnostics).size).toBe(0);
    expect(changedDiagnostics(warning.diagnostics, none.diagnostics).get("drive:v1")).toEqual([]);
  });
});

describe("AC power ports", () => {
  const motorDocument = documentOf({
    assemblies: ["a"],
    bodies: [bodyOf("wheel", "a")],
    joints: [jointOf("j1", "wheel", "continuous")],
    drives: [driveOf("m1", "a", "reversing_contactor")],
    actuators: [
      actuatorOf(
        "motor",
        "a",
        { type: "ac_motor", nominalSpeed: 1 },
        { drive: "m1", ports: { in: "out" } },
        ["j1"],
      ),
    ],
  });
  const motorDiagram = layoutChainDiagram(motorDocument, new Set(), "en");
  const litWith = (direction: -1 | 0 | 1) =>
    liveStateOf(
      motorDiagram,
      motorDocument,
      {
        tags: new Map(),
        runtime: runtime({ id: "m1", ports: { out: { direction, ratio: 1 } }, diagnostics: [] }),
      },
      t,
    ).litEdges;

  it("lights the edge for either direction and not when stopped", () => {
    expect(litWith(1).size).toBe(1);
    expect(litWith(-1).size).toBe(1);
    expect(litWith(0).size).toBe(0);
  });

  it("lights the ac_power edge only", () => {
    const [id] = [...litWith(1)];
    expect(motorDiagram.edges.find((edge) => edge.id === id)?.kind).toBe("ac_power");
  });
});
