import { isJsonObject, type JsonObject } from "./json-object.ts";

// Version 10 gives every assembly a placement (ADR 0033 point 10). All of them
// get the identity, so every frame is the Pantin frame and joint origins and
// axes keep their numbers. A document whose joints between assemblies give an
// assembly two anchors, or close a loop, is not rewritten: the document
// schema then refuses it with a message naming the joints.
export function migrateV9ToV10(document: JsonObject): JsonObject {
  const assemblies = Array.isArray(document.assemblies)
    ? document.assemblies.map((assembly: unknown) =>
        isJsonObject(assembly)
          ? { ...assembly, placement: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] } }
          : assembly,
      )
    : document.assemblies;
  return { ...document, schema_version: 10, assemblies };
}
