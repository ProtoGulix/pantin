const BINARY_STL_HEADER_BYTES = 84;
const BINARY_STL_TRIANGLE_BYTES = 50;
// How far into an ASCII STL to look for the first "facet" keyword.
const ASCII_STL_SNIFF_BYTES = 64 * 1024;

// Binary STL has no magic number: an 80-byte header, a uint32 triangle count,
// then exactly 50 bytes per triangle. The exact size is the signature.
export function isBinaryStl(bytes: Uint8Array): boolean {
  if (bytes.byteLength < BINARY_STL_HEADER_BYTES) {
    return false;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangleCount = view.getUint32(80, true);
  return bytes.byteLength === BINARY_STL_HEADER_BYTES + triangleCount * BINARY_STL_TRIANGLE_BYTES;
}

export function isAsciiStl(bytes: Uint8Array): boolean {
  const text = new TextDecoder("latin1").decode(bytes.subarray(0, ASCII_STL_SNIFF_BYTES));
  return /^\s*solid\b/.test(text) && /\bfacet\b/.test(text);
}
