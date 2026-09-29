import {
  type Body,
  BodySchema,
  type ImportBodyQuery,
  PANTIN_MESHES_DIRECTORY_NAME,
  type PantinDocument,
  type SourceNode,
} from "@pantin/protocol";
import { fileNameStem, makeUniqueId, slugifyDisplayName } from "./ids.ts";
import { toDisplayName } from "./import-body.ts";
import { parseWithSchema } from "./validation.ts";

export type ConvertedComponent = { name: string; nodes: SourceNode[] };

// The name of the assembly a STEP import creates (ADR 0019 point 3): the
// root product, which the converter puts first in every component's node
// chain, when all components share it; otherwise (several roots, no nodes)
// the file name.
export function stepAssemblyName(
  query: ImportBodyQuery,
  components: readonly ConvertedComponent[],
): string {
  const rootNames = new Set(components.map((component) => component.nodes[0]?.name ?? ""));
  const [rootName] = rootNames;
  const fileName = toDisplayName(fileNameStem(query.fileName), "Assembly");
  return rootNames.size === 1 && rootName !== undefined
    ? toDisplayName(rootName, fileName)
    : fileName;
}

// One body per leaf component of a converted STEP assembly (ADR 0009 point 4):
// the converter outputs metres and Z up, and the STEP node names verbatim.
// Returns each component with its body, in the converter's order.
export function buildStepBodies<Component extends ConvertedComponent>(
  document: PantinDocument,
  query: ImportBodyQuery,
  components: readonly Component[],
  otherTakenIds: Iterable<string>,
  assemblyKey: string,
): { body: Body; component: Component }[] {
  const takenIds = new Set([...document.bodies.map((body) => body.id), ...otherTakenIds]);
  const stem = fileNameStem(query.fileName);
  return components.map((component, index) => {
    const name = toDisplayName(component.name, `${toDisplayName(stem, "Component")} ${index + 1}`);
    const id = makeUniqueId(slugifyDisplayName(name, "component"), takenIds);
    takenIds.add(id);
    const body: Body = {
      id,
      name,
      assembly: assemblyKey,
      source: {
        fileName: query.fileName,
        format: "step",
        unit: "m",
        upAxis: "z",
        nodes: component.nodes,
      },
      mesh: `${PANTIN_MESHES_DIRECTORY_NAME}/${id}.glb`,
    };
    const context = `The body for STEP component "${component.name}"`;
    return { body: parseWithSchema(BodySchema, body, context), component };
  });
}
