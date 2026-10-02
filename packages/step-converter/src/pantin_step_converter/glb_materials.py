"""Gives CAD colours a matte, non metallic look in the written GLB files.

STEP files carry plain colours, and OpenCascade writes them as a glTF base
colour only. glTF then defaults `metallicFactor` and `roughnessFactor` to 1,
i.e. fully metallic: without an environment to reflect, such surfaces render
dark or black. Painted and plastic parts are dielectric, so the converter
states it explicitly, keeping any value OpenCascade did write.
"""

import json
from pathlib import Path
from typing import Any

from pantin_step_converter.glb_file import CHUNK_HEADER, GLB_HEADER, JSON_CHUNK_TYPE, read_glb

CAD_METALLIC_FACTOR = 0.0
CAD_ROUGHNESS_FACTOR = 0.6


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
    content = read_glb(glb_path)
    json_chunk = _padded_json_chunk(_with_cad_defaults(content.gltf))
    rest = content.after_json_chunk
    json_start = GLB_HEADER.size + CHUNK_HEADER.size
    total_length = json_start + len(json_chunk) + len(rest)
    glb_path.write_bytes(
        GLB_HEADER.pack(b"glTF", 2, total_length)
        + CHUNK_HEADER.pack(len(json_chunk), JSON_CHUNK_TYPE)
        + json_chunk
        + rest
    )
