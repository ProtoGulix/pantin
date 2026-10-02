import json
import struct
from pathlib import Path
from typing import Any

import pytest

from pantin_step_converter.errors import ConverterError
from pantin_step_converter.glb_materials import (
    CAD_METALLIC_FACTOR,
    CAD_ROUGHNESS_FACTOR,
    apply_cad_material_defaults,
)

BINARY_PAYLOAD = b"\x01\x02\x03\x04\x05\x06\x07\x08"


def write_glb(path: Path, gltf: object) -> Path:
    json_chunk = json.dumps(gltf).encode("utf-8")
    json_chunk += b" " * (-len(json_chunk) % 4)
    body = struct.pack("<II", len(json_chunk), 0x4E4F534A) + json_chunk
    body += struct.pack("<II", len(BINARY_PAYLOAD), 0x004E4942) + BINARY_PAYLOAD
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body)
    return path


def read_glb(path: Path) -> tuple[int, dict[str, Any], bytes]:
    data = path.read_bytes()
    _magic, _version, total_length = struct.unpack_from("<4sII", data, 0)
    json_length, _ = struct.unpack_from("<II", data, 12)
    gltf = json.loads(data[20 : 20 + json_length])
    return total_length, gltf, data[20 + json_length :]


def test_colour_only_materials_become_matte_and_non_metallic(tmp_path: Path) -> None:
    glb = write_glb(
        tmp_path / "part.glb",
        {"materials": [{"pbrMetallicRoughness": {"baseColorFactor": [0, 0, 0, 1]}}, {}]},
    )

    apply_cad_material_defaults(glb)

    _total, gltf, _rest = read_glb(glb)
    for material in gltf["materials"]:
        assert material["pbrMetallicRoughness"]["metallicFactor"] == CAD_METALLIC_FACTOR
        assert material["pbrMetallicRoughness"]["roughnessFactor"] == CAD_ROUGHNESS_FACTOR
    assert gltf["materials"][0]["pbrMetallicRoughness"]["baseColorFactor"] == [0, 0, 0, 1]


def test_explicit_values_are_kept(tmp_path: Path) -> None:
    pbr = {"metallicFactor": 0.9, "roughnessFactor": 0.2}
    glb = write_glb(tmp_path / "metal.glb", {"materials": [{"pbrMetallicRoughness": pbr}]})

    apply_cad_material_defaults(glb)

    _total, gltf, _rest = read_glb(glb)
    assert gltf["materials"][0]["pbrMetallicRoughness"] == pbr


def test_file_stays_a_valid_glb_with_the_binary_chunk_untouched(tmp_path: Path) -> None:
    glb = write_glb(tmp_path / "part.glb", {"asset": {"version": "2.0"}, "materials": [{}]})

    apply_cad_material_defaults(glb)

    total_length, _gltf, rest = read_glb(glb)
    assert total_length == glb.stat().st_size
    assert (glb.stat().st_size - 20) % 4 == 0
    assert rest.endswith(BINARY_PAYLOAD)


def test_rejects_a_file_that_is_not_a_glb(tmp_path: Path) -> None:
    not_glb = tmp_path / "part.glb"
    not_glb.write_bytes(b"solid ascii stl" + b" " * 32)

    with pytest.raises(ConverterError):
        apply_cad_material_defaults(not_glb)


def test_rejects_a_glb_whose_json_is_not_an_object(tmp_path: Path) -> None:
    glb = write_glb(tmp_path / "part.glb", [{"materials": [{}]}])

    with pytest.raises(ConverterError):
        apply_cad_material_defaults(glb)


def test_rejects_a_truncated_glb(tmp_path: Path) -> None:
    glb = write_glb(tmp_path / "part.glb", {"materials": [{}]})
    glb.write_bytes(glb.read_bytes()[:24])

    with pytest.raises(ConverterError):
        apply_cad_material_defaults(glb)
