import {
  type Body,
  type Joint,
  PANTIN_SCHEMA_VERSION,
  type PantinDocument,
} from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import {
  createAssembly,
  deleteAssembly,
  moveBody,
  renameAssembly,
  renameAssemblyKey,
  renameTagKey,
} from "./assembly-edits.ts";
import { renamedTags } from "./tags.ts";

// ADR 0019 points 8 to 10: keys change only through these edits.

function body(id: string, assembly: string): Body {
  return {
    id,
    name: id,
    assembly,
    source: { fileName: "press.step", format: "step", unit: "m", upAxis: "z", nodes: [] },
    mesh: `meshes/${id}.glb`,
  };
}

function rod(id: string, parent: string, child: string, tagKey = "tige"): Joint {
  return {
    id,
    tagKey,
    name: "Tige",
    type: "prismatic",
    parent,
    child,
    origin: [0, 0, 0],
    axis: [1, 0, 0],
    limits: [0, 0.1],
  };
}

// Two cylinders as imported: unreadable keys, one rod each.
const PRESS: PantinDocument = {
  schema_version: PANTIN_SCHEMA_VERSION,
  name: "Press",
  assemblies: [
    { key: "id1s0400125e-0", name: "ID1S0400125E_0" },
    { key: "id1s0400125e-0-2", name: "ID1S0400125E_0" },
  ],
  bodies: [
    body("body-1", "id1s0400125e-0"),
    body("rod-1", "id1s0400125e-0"),
    body("body-2", "id1s0400125e-0-2"),
    body("rod-2", "id1s0400125e-0-2"),
  ],
  joints: [rod("tige", "body-1", "rod-1"), rod("tige-2", "body-2", "rod-2")],
  drives: [],
  actuators: [],
  sensors: [],
};

describe("renameAssemblyKey", () => {
  it("rewrites the key of the assembly and of its bodies, and reports the renamed tags", () => {
    const after = renameAssemblyKey(PRESS, "id1s0400125e-0", "verin_pince");
    expect(after.assemblies[0]).toEqual({ key: "verin_pince", name: "ID1S0400125E_0" });
    expect(after.bodies.map((item) => item.assembly).slice(0, 2)).toEqual([
      "verin_pince",
      "verin_pince",
    ]);
    expect(renamedTags(PRESS, after)).toEqual([
      { from: "id1s0400125e-0.tige.setpoint", to: "verin_pince.tige.setpoint" },
      { from: "id1s0400125e-0.tige.position", to: "verin_pince.tige.position" },
    ]);
  });

  it("refuses a key taken by another assembly, naming a free one", () => {
    expect(() => renameAssemblyKey(PRESS, "id1s0400125e-0", "id1s0400125e-0-2")).toThrow(
      'Key "id1s0400125e-0-2" is already used by assembly "ID1S0400125E_0". "id1s0400125e-0-2-2" is free.',
    );
  });

  it("refuses an unknown assembly", () => {
    expect(() => renameAssemblyKey(PRESS, "ghost", "x")).toThrow('no assembly "ghost"');
  });
});

describe("renameTagKey", () => {
  it("renames the tags of that joint only", () => {
    const after = renameTagKey(PRESS, "tige-2", "tige_levage");
    expect(renamedTags(PRESS, after)).toEqual([
      { from: "id1s0400125e-0-2.tige.setpoint", to: "id1s0400125e-0-2.tige_levage.setpoint" },
      { from: "id1s0400125e-0-2.tige.position", to: "id1s0400125e-0-2.tige_levage.position" },
    ]);
  });

  it("renames nothing visible for a fixed joint, but keeps the key for later", () => {
    const weld: Joint = {
      id: "tige",
      tagKey: "tige",
      name: "Tige",
      type: "fixed",
      parent: "body-1",
      child: "rod-1",
      origin: [0, 0, 0],
      axis: [0, 0, 1],
    };
    const fixed: PantinDocument = { ...PRESS, joints: [weld] };
    const after = renameTagKey(fixed, "tige", "tige_pince");
    expect(after.joints[0]?.tagKey).toBe("tige_pince");
    expect(renamedTags(fixed, after)).toEqual([]);
  });

  it("refuses a tag key taken in the same assembly, and allows it in another", () => {
    const withStop: PantinDocument = {
      ...PRESS,
      bodies: [...PRESS.bodies, body("stop-1", "id1s0400125e-0")],
      joints: [...PRESS.joints, rod("stop", "body-1", "stop-1", "stop")],
    };
    expect(() => renameTagKey(withStop, "stop", "tige")).toThrow(
      'Key "tige" is already used by joint "tige" in assembly "id1s0400125e-0". "tige-2" is free.',
    );
    expect(() => renameTagKey(withStop, "tige-2", "stop")).not.toThrow();
    // A joint whose key is "tige-2" asks for "tige": "tige-2" is never suggested back.
    const ownKey = {
      ...withStop,
      joints: [...PRESS.joints, rod("stop", "body-1", "stop-1", "tige-2")],
    };
    expect(() => renameTagKey(ownKey, "stop", "tige")).toThrow('"tige-3" is free.');
  });
});

describe("moveBody", () => {
  it("moves the body with its parent joint, whose tags follow", () => {
    const withSpare = createAssembly(PRESS, "Spare").document;
    const after = moveBody(withSpare, "rod-1", "spare");
    expect(renamedTags(withSpare, after)).toEqual([
      { from: "id1s0400125e-0.tige.setpoint", to: "spare.tige.setpoint" },
      { from: "id1s0400125e-0.tige.position", to: "spare.tige.position" },
    ]);
  });

  it("refuses a move that would give two joints the same tag key there", () => {
    expect(() => moveBody(PRESS, "rod-1", "id1s0400125e-0-2")).toThrow(
      /Tag key "tige" of joint "tige" is already used by joint "tige-2".*Rename one of the tag keys first/,
    );
  });

  it("refuses an unknown body or assembly", () => {
    expect(() => moveBody(PRESS, "ghost", "id1s0400125e-0")).toThrow('no body "ghost"');
    expect(() => moveBody(PRESS, "rod-1", "ghost")).toThrow('no assembly "ghost"');
  });
});

describe("assembly display names and deletion", () => {
  it("renames the display name only: no tag changes", () => {
    const after = renameAssembly(PRESS, "id1s0400125e-0", "Vérin pince");
    expect(after.assemblies[0]?.name).toBe("Vérin pince");
    expect(renamedTags(PRESS, after)).toEqual([]);
  });

  it("deletes an empty assembly and refuses one that holds bodies", () => {
    const { document, assembly } = createAssembly(PRESS, "Spare");
    expect(deleteAssembly(document, assembly.key).assemblies).toEqual(PRESS.assemblies);
    expect(() => deleteAssembly(PRESS, "id1s0400125e-0")).toThrow(
      'Assembly "ID1S0400125E_0" still holds 2 bodies. Move or delete them first.',
    );
  });
});

const valve = {
  id: "valve",
  tagKey: "valve",
  name: "Valve",
  assembly: "id1s0400125e-0",
  type: "valve_5_3_closed" as const,
};
const cylinder = {
  id: "cylinder",
  name: "Cylinder",
  assembly: "id1s0400125e-0",
  type: "double_acting_cylinder" as const,
  extendSpeed: 0.2,
  retractSpeed: 0.2,
  feed: { drive: "valve", ports: { cap: "port_4", rod: "port_2" } },
  joints: ["tige"],
};
const withValve: PantinDocument = { ...PRESS, drives: [valve] };

describe("assembly edits and drives (ADR 0022)", () => {
  it("moves a drive with its assembly's key, and reports its renamed tags", () => {
    const after = renameAssemblyKey(withValve, "id1s0400125e-0", "verin_pince");
    expect(after.drives[0]?.assembly).toBe("verin_pince");
    expect(renamedTags(withValve, after).map((tag) => tag.to)).toContain(
      "verin_pince.valve.coil_14",
    );
  });
});

describe("assembly edits and actuators (ADR 0028)", () => {
  it("moves an actuator with its assembly's key", () => {
    const withCylinder: PantinDocument = { ...withValve, actuators: [cylinder] };
    const after = renameAssemblyKey(withCylinder, "id1s0400125e-0", "verin_pince");
    expect(after.actuators[0]?.assembly).toBe("verin_pince");
  });

  it("refuses to delete an assembly that still holds an actuator", () => {
    const emptied = {
      ...PRESS,
      bodies: [],
      joints: [],
      actuators: [{ ...cylinder, feed: undefined, joints: [] }],
    };
    expect(() => deleteAssembly(emptied, "id1s0400125e-0")).toThrow(
      'Assembly "ID1S0400125E_0" still holds actuator "cylinder". Move or delete it first.',
    );
  });
});

describe("assembly deletion and tag keys with drives (ADR 0022)", () => {
  it("refuses to delete an assembly that still holds a drive", () => {
    const emptied = { ...withValve, bodies: [], joints: [] };
    expect(() => deleteAssembly(emptied, "id1s0400125e-0")).toThrow(
      'Assembly "ID1S0400125E_0" still holds drive "valve". Move or delete it first.',
    );
  });

  it("refuses a joint tag key taken by a drive of the same assembly", () => {
    expect(() => renameTagKey(withValve, "tige", "valve")).toThrow(
      /Key "valve" is already used by drive "valve"/,
    );
  });
});
