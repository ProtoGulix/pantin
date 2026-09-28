// Small valid mesh files built in memory for the tests.

export const SAMPLE_GLB_NODE_NAMES = [
  "3630.00.0800N",
  "3630.00.0800N_0",
  "3630.00.0800N_0_1",
  "3630.00.0800N_0_2",
] as const;

function padToFourBytes(bytes: Uint8Array, padByte: number): Uint8Array {
  const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4).fill(padByte);
  padded.set(bytes);
  return padded;
}

// A glTF 2.0 binary with only a JSON chunk, which is valid when no buffer is used.
export function buildGlb(gltf: unknown): Uint8Array {
  const json = padToFourBytes(new TextEncoder().encode(JSON.stringify(gltf)), 0x20);
  const bytes = new Uint8Array(12 + 8 + json.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, json.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(json, 20);
  return bytes;
}

// Root "3630.00.0800N" with three children, one name repeated under an unnamed
// group to check that duplicates are kept verbatim with distinct paths.
export function buildSampleGlb(): Uint8Array {
  const [rootName, childA, childB, childC] = SAMPLE_GLB_NODE_NAMES;
  return buildGlb({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: rootName, children: [1, 2, 3, 4] },
      { name: childA },
      { name: childB },
      { name: childC },
      { children: [5] },
      { name: childA },
    ],
  });
}

export function buildAsciiStl(): Uint8Array {
  const text = [
    "solid bracket",
    "  facet normal 0 0 1",
    "    outer loop",
    "      vertex 0 0 0",
    "      vertex 1 0 0",
    "      vertex 0 1 0",
    "    endloop",
    "  endfacet",
    "endsolid bracket",
    "",
  ].join("\n");
  return new TextEncoder().encode(text);
}

export function buildBinaryStl(triangleCount: number): Uint8Array {
  const bytes = new Uint8Array(84 + triangleCount * 50);
  new DataView(bytes.buffer).setUint32(80, triangleCount, true);
  return bytes;
}
