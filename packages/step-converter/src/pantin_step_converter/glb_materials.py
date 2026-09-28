"""Gives CAD colours a matte, non metallic look in the written GLB files.

STEP files carry plain colours, and OpenCascade writes them as a glTF base
colour only. glTF then defaults `metallicFactor` and `roughnessFactor` to 1,
i.e. fully metallic: without an environment to reflect, such surfaces render
dark or black. Painted and plastic parts are dielectric, so the converter
states it explicitly, keeping any value OpenCascade did write.
"""

import json
import struct
from pathlib import Path
from typing import Any

from pantin_step_converter.errors import ConverterError

CAD_METALLIC_FACTOR = 0.0
CAD_ROUGHNESS_FACTOR = 0.6

_GLB_HEADER = struct.Struct("<4sII")
_CHUNK_HEADER = struct.Struct("<II")
_JSON_CHUNK_TYPE = 0x4E4F534A


def _with_cad_defaults(gltf: dict[str, Any]) -> dict[str, Any]:
    for material in gltf.get("materials", []):
        pbr = material.setdefault("pbrMetallicRoughness", {})
        pbr.setdefault("metallicFactor", CAD_METALLIC_FACTOR)
        pbr.setdefault("roughnessFactor", CAD_ROUGHNESS_FACTOR)
    return gltf


def _padded_json_chunk(gltf: dict[str, Any]) -> bytes:
    # GLB chunks are 4-byte aligned; the JSON chunk is padded with spaces.
    encoded = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    return encoded + b" " * (-len(encoded) % 4)


def apply_cad_material_defaults(glb_path: Path) -> None:
    """Rewrite the JSON chunk of a GLB file in place; the binary chunk is untouched."""
    data = glb_path.read_bytes()
    not_a_glb = ConverterError(f"{glb_path.name} is not a GLB 2.0 file with a JSON chunk.")
    json_start = _GLB_HEADER.size + _CHUNK_HEADER.size
    try:
        magic, version, _ = _GLB_HEADER.unpack_from(data, 0)
        json_length, json_type = _CHUNK_HEADER.unpack_from(data, _GLB_HEADER.size)
        if json_start + json_length > len(data):
            raise not_a_glb
        gltf = json.loads(data[json_start : json_start + json_length])
    except (struct.error, ValueError) as error:
        raise not_a_glb from error
    if magic != b"glTF" or version != 2 or json_type != _JSON_CHUNK_TYPE:
        raise not_a_glb
    json_chunk = _padded_json_chunk(_with_cad_defaults(gltf))
    rest = data[json_start + json_length :]
    total_length = json_start + len(json_chunk) + len(rest)
    glb_path.write_bytes(
        _GLB_HEADER.pack(b"glTF", 2, total_length)
        + _CHUNK_HEADER.pack(len(json_chunk), _JSON_CHUNK_TYPE)
        + json_chunk
        + rest
    )
