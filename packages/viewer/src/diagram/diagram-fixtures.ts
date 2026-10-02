import { PANTIN_SCHEMA_VERSION, type PantinDocument, PantinDocumentSchema } from "@pantin/protocol";

// Small documents for the layout tests. They go through the protocol schema,
// so a fixture that breaks a document rule fails here, not silently.

export function bodyOf(id: string, assembly: string) {
  return {
    id,
    name: id,
    assembly,
    source: { fileName: "m.step", format: "step", unit: "m", upAxis: "z", nodes: [] },
    mesh: `meshes/${id}.glb`,
  };
}

export function jointOf(id: string, child: string, type = "prismatic") {
  const limits = type === "fixed" || type === "continuous" ? {} : { limits: [0, 0.1] };
  return {
    id,
    tagKey: id,
    name: id,
    type,
    parent: "frame",
    child,
    origin: [0, 0, 0],
    axis: [1, 0, 0],
    ...limits,
  };
}

export function driveOf(id: string, assembly: string, type = "valve_5_2_double") {
  return { id, tagKey: id, name: id, assembly, type };
}

export function actuatorOf(
  id: string,
  assembly: string,
  fields: object,
  feed: { drive: string; ports: Record<string, string> } | null,
  joints: string[],
) {
  return { id, name: id, assembly, ...fields, ...(feed === null ? {} : { feed }), joints };
}

const DOUBLE_CYLINDER = { type: "double_acting_cylinder", extendSpeed: 0.2, retractSpeed: 0.2 };

export function cylinderOf(
  id: string,
  assembly: string,
  feedDrive: string | null,
  joints: string[],
  ports: Record<string, string> = { cap: "port_4", rod: "port_2" },
) {
  const feed = feedDrive === null ? null : { drive: feedDrive, ports };
  return actuatorOf(id, assembly, DOUBLE_CYLINDER, feed, joints);
}

export function encoderOf(id: string, assembly: string, joint: string) {
  return { id, tagKey: id, name: id, assembly, joint, type: "encoder", pulsesPerUnit: 1000 };
}

interface FixtureBody {
  id: string;
  assembly: string;
}

interface Parts {
  assemblies: string[];
  bodies: object[];
  joints?: object[];
  drives?: object[];
  actuators?: object[];
  sensors?: object[];
}

// Joints of the fixtures hang from the body "frame"; a joint whose child sits
// in another assembly hangs from a frame of that assembly instead, because an
// assembly has at most one anchor (ADR 0033).
function withAssemblyFrames(parts: Parts, rootAssembly: string) {
  // Fixture parts are loose objects, checked by the document schema later;
  // every body and joint of these fixtures has these fields.
  const assemblyOf = new Map(
    parts.bodies.map((body) => [(body as FixtureBody).id, (body as FixtureBody).assembly]),
  );
  const frames = new Set<string>();
  const joints = (parts.joints ?? []).map((joint) => {
    const { parent, child } = joint as { parent: string; child: string };
    const assembly = assemblyOf.get(child);
    if (parent !== "frame" || assembly === undefined || assembly === rootAssembly) {
      return joint;
    }
    frames.add(assembly);
    return { ...joint, parent: `frame-${assembly}` };
  });
  return { joints, frames: [...frames].map((assembly) => bodyOf(`frame-${assembly}`, assembly)) };
}

export function documentOf(parts: Parts): PantinDocument {
  const rootAssembly = parts.assemblies[0] ?? "a";
  const { joints, frames } = withAssemblyFrames(parts, rootAssembly);
  return PantinDocumentSchema.parse({
    schema_version: PANTIN_SCHEMA_VERSION,
    name: "Test",
    assemblies: parts.assemblies.map((key) => ({
      key,
      name: key.toUpperCase(),
      placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] },
    })),
    bodies: [bodyOf("frame", rootAssembly), ...frames, ...parts.bodies],
    joints,
    drives: parts.drives ?? [],
    actuators: parts.actuators ?? [],
    sensors: parts.sensors ?? [],
  });
}
