"""Reads the chunks and accessors of a binary glTF (GLB 2.0) file."""

import json
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pantin_step_converter.errors import ConverterError

GLB_HEADER = struct.Struct("<4sII")
CHUNK_HEADER = struct.Struct("<II")
JSON_CHUNK_TYPE = 0x4E4F534A
_BINARY_CHUNK_TYPE = 0x004E4942

# glTF accessor component types and element widths used by OpenCascade.
_COMPONENT_FORMATS = {5123: "H", 5125: "I", 5126: "f"}
_ELEMENT_WIDTHS = {"SCALAR": 1, "VEC3": 3}


@dataclass(frozen=True)
class GlbContent:
    gltf: dict[str, Any]
    # Everything after the JSON chunk, byte for byte, for in place rewrites.
    after_json_chunk: bytes
    # Payload of the binary chunk, empty when there is none.
    binary: bytes


def read_glb(glb_path: Path) -> GlbContent:
    data = glb_path.read_bytes()
    not_a_glb = ConverterError(f"{glb_path.name} is not a GLB 2.0 file with a JSON chunk.")
    json_start = GLB_HEADER.size + CHUNK_HEADER.size
    try:
        magic, version, _ = GLB_HEADER.unpack_from(data, 0)
        json_length, json_type = CHUNK_HEADER.unpack_from(data, GLB_HEADER.size)
        if json_start + json_length > len(data):
            raise not_a_glb
        gltf = json.loads(data[json_start : json_start + json_length])
    except (struct.error, ValueError) as error:
        raise not_a_glb from error
    if magic != b"glTF" or version != 2 or json_type != JSON_CHUNK_TYPE:
        raise not_a_glb
    if not isinstance(gltf, dict):
        raise not_a_glb
    after_json_chunk = data[json_start + json_length :]
    return GlbContent(gltf, after_json_chunk, _binary_payload(after_json_chunk))


def _binary_payload(after_json_chunk: bytes) -> bytes:
    if len(after_json_chunk) < CHUNK_HEADER.size:
        return b""
    length, chunk_type = CHUNK_HEADER.unpack_from(after_json_chunk, 0)
    if chunk_type != _BINARY_CHUNK_TYPE:
        return b""
    return after_json_chunk[CHUNK_HEADER.size : CHUNK_HEADER.size + length]


def read_accessor(content: GlbContent, accessor_index: int) -> tuple[float | int, ...]:
    """The accessor's values, flattened; only tightly packed SCALAR and VEC3 are supported.

    OpenCascade states the stride of vertex views even when it is the element
    size, so a stride equal to the element size counts as tightly packed.
    """
    try:
        accessor = content.gltf["accessors"][accessor_index]
        view = content.gltf["bufferViews"][accessor["bufferView"]]
        component_format = _COMPONENT_FORMATS.get(accessor["componentType"])
        width = _ELEMENT_WIDTHS.get(accessor["type"])
        element_count = int(accessor["count"])
        stride = view.get("byteStride")
        start = int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0))
    except (KeyError, IndexError, TypeError, ValueError, AttributeError) as error:
        raise ConverterError(f"Accessor {accessor_index} is not described.") from error
    if component_format is None or width is None:
        raise ConverterError(f"Accessor {accessor_index} has a type the converter cannot read.")
    element_size = struct.calcsize(f"<{width}{component_format}")
    if stride is not None and stride != element_size:
        raise ConverterError(f"Accessor {accessor_index} is interleaved.")
    count = element_count * width
    try:
        return struct.unpack_from(f"<{count}{component_format}", content.binary, start)
    except struct.error as error:
        raise ConverterError(f"Accessor {accessor_index} lies outside the binary chunk.") from error
