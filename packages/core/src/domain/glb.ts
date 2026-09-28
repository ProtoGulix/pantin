import type { SourceNode } from "@pantin/protocol";
import { ApiError } from "../errors.ts";

const GLB_MAGIC = 0x46546c67; // "glTF" read as a little-endian uint32
const GLB_VERSION = 2;
const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;
const JSON_CHUNK_TYPE = 0x4e4f534a; // "JSON"

type GltfNode = { name: string | undefined; children: number[] };

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function hasGlbHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < GLB_HEADER_BYTES) {
    return false;
  }
  const view = viewOf(bytes);
  return view.getUint32(0, true) === GLB_MAGIC && view.getUint32(4, true) === GLB_VERSION;
}

function invalidGlb(reason: string): ApiError {
  return new ApiError("unsupported_file", `The GLB file is malformed: ${reason}. Re-export it.`);
}

function readJsonChunk(bytes: Uint8Array): unknown {
  const view = viewOf(bytes);
  if (view.getUint32(8, true) !== bytes.byteLength) {
    throw invalidGlb("its header length does not match the file size");
  }
  if (bytes.byteLength < GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES) {
    throw invalidGlb("the JSON chunk is missing");
  }
  const chunkLength = view.getUint32(12, true);
  const chunkStart = GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES;
  if (view.getUint32(16, true) !== JSON_CHUNK_TYPE || chunkStart + chunkLength > bytes.byteLength) {
    throw invalidGlb("the first chunk is not a complete JSON chunk");
  }
  const text = new TextDecoder().decode(bytes.subarray(chunkStart, chunkStart + chunkLength));
  try {
    return JSON.parse(text);
  } catch {
    throw invalidGlb("the JSON chunk is not valid JSON");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readIndexList(value: unknown, what: string): number[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every((item) => Number.isInteger(item) && item >= 0)) {
    throw invalidGlb(`${what} must be a list of node indices`);
  }
  return value;
}

function readNodes(gltf: Record<string, unknown>): GltfNode[] {
  const nodes = gltf.nodes ?? [];
  if (!Array.isArray(nodes)) {
    throw invalidGlb('"nodes" must be a list');
  }
  return nodes.map((node: unknown, index) => {
    if (!isRecord(node)) {
      throw invalidGlb(`node ${index} must be an object`);
    }
    const name = typeof node.name === "string" ? node.name : undefined;
    return { name, children: readIndexList(node.children, `children of node ${index}`) };
  });
}

// Root nodes of the default scene; without scenes, every node nobody lists as
// a child is a root.
function readRootIndices(gltf: Record<string, unknown>, nodes: GltfNode[]): number[] {
  const scenes = gltf.scenes;
  if (Array.isArray(scenes) && scenes.length > 0) {
    const sceneIndex = typeof gltf.scene === "number" ? gltf.scene : 0;
    const scene: unknown = scenes[sceneIndex];
    if (!isRecord(scene)) {
      throw invalidGlb(`scene ${sceneIndex} does not exist`);
    }
    return readIndexList(scene.nodes, `nodes of scene ${sceneIndex}`);
  }
  const childIndices = new Set(nodes.flatMap((node) => node.children));
  return nodes.map((_node, index) => index).filter((index) => !childIndices.has(index));
}

// Depth-first walk. A node's path is the list of glTF node indices from its
// scene root down to itself, so duplicate names stay distinguishable.
// Unnamed nodes are not listed, but their named descendants are. glTF gives a
// node at most one parent, so a node reached twice (shared child, cycle) is an
// error; this also keeps the walk linear in the number of nodes.
function collectNamedNodes(nodes: GltfNode[], rootIndices: number[]): SourceNode[] {
  const collected: SourceNode[] = [];
  const visited = new Set<number>();
  const visit = (nodeIndex: number, parentPath: number[]): void => {
    const node = nodes[nodeIndex];
    if (node === undefined) {
      throw invalidGlb(`node index ${nodeIndex} does not exist`);
    }
    if (visited.has(nodeIndex)) {
      throw invalidGlb(`node ${nodeIndex} is reached twice, but a node has at most one parent`);
    }
    visited.add(nodeIndex);
    const path = [...parentPath, nodeIndex];
    if (node.name !== undefined) {
      collected.push({ name: node.name, path });
    }
    for (const childIndex of node.children) {
      visit(childIndex, path);
    }
  };
  for (const rootIndex of rootIndices) {
    visit(rootIndex, []);
  }
  return collected;
}

// Precondition: hasGlbHeader(bytes). Returns every named node, verbatim.
export function extractGlbNodes(bytes: Uint8Array): SourceNode[] {
  const gltf = readJsonChunk(bytes);
  if (!isRecord(gltf)) {
    throw invalidGlb("the JSON chunk must be an object");
  }
  const nodes = readNodes(gltf);
  return collectNamedNodes(nodes, readRootIndices(gltf, nodes));
}
