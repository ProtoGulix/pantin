import type { FaceFile } from "@pantin/protocol";

// From a picked triangle to the B-rep face it belongs to (ADR 0035 point 3).
// Babylon's glTF loader makes one mesh per glTF primitive and records its JSON
// pointer ("/meshes/0/primitives/1") on it; the pick gives the triangle index
// inside that primitive, which the face file's ranges map to a face.

export interface PrimitiveRef {
  mesh: number;
  primitive: number;
}

const PRIMITIVE_POINTER = /^\/meshes\/(\d+)\/primitives\/(\d+)$/;

/** The glTF primitive among a Babylon mesh's pointers, or null (an STL body has none). */
export function primitiveOfPointers(pointers: readonly string[]): PrimitiveRef | null {
  for (const pointer of pointers) {
    const match = PRIMITIVE_POINTER.exec(pointer);
    if (match !== null) {
      return { mesh: Number(match[1]), primitive: Number(match[2]) };
    }
  }
  return null;
}

export interface PickedFace {
  face: number;
  firstTriangle: number;
  triangleCount: number;
}

/** The face whose range holds `triangle` of the primitive, or null when none does. */
export function faceAtTriangle(
  faceFile: FaceFile,
  primitive: PrimitiveRef,
  triangle: number,
): PickedFace | null {
  const mapped = faceFile.primitives.find(
    (candidate) => candidate.mesh === primitive.mesh && candidate.primitive === primitive.primitive,
  );
  const range = mapped?.ranges.find(
    ([first, count]) => triangle >= first && triangle < first + count,
  );
  return range === undefined
    ? null
    : { face: range[2], firstTriangle: range[0], triangleCount: range[1] };
}
