"""Runs the converter as a child process, exactly as the core does (ADR 0009)."""

import json
import os
import struct
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest

SOURCE_DIR = Path(__file__).resolve().parent.parent / "src"
GLB_MAGIC = b"glTF"
JSON_CHUNK_TYPE = 0x4E4F534A


@dataclass(frozen=True)
class ConverterRun:
    exit_code: int
    output: dict[str, Any]
    stderr: str


def run_converter(input_path: Path, output_dir: Path) -> ConverterRun:
    environment = {**os.environ, "PYTHONPATH": str(SOURCE_DIR)}
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "pantin_step_converter",
            "--input",
            str(input_path),
            "--output-dir",
            str(output_dir),
        ],
        capture_output=True,
        text=True,
        env=environment,
        check=False,
        timeout=120,
    )
    # json.loads rejects anything after the object, so this also proves that
    # stdout carries nothing else (no OpenCascade progress messages).
    output = json.loads(completed.stdout)
    assert isinstance(output, dict)
    assert completed.stdout.endswith("}\n")
    return ConverterRun(completed.returncode, output, completed.stderr)


def read_gltf_json(glb_path: Path) -> dict[str, Any]:
    data = glb_path.read_bytes()
    magic, _version, total_length = struct.unpack_from("<4sII", data, 0)
    assert magic == GLB_MAGIC
    assert total_length == len(data)
    chunk_length, chunk_type = struct.unpack_from("<II", data, 12)
    assert chunk_type == JSON_CHUNK_TYPE
    gltf = json.loads(data[20 : 20 + chunk_length])
    assert isinstance(gltf, dict)
    return gltf


def node_named(gltf: dict[str, Any], name: str) -> dict[str, Any]:
    matches = [node for node in gltf["nodes"] if node.get("name") == name]
    assert len(matches) == 1, f"expected one node named {name!r}"
    node: dict[str, Any] = matches[0]
    return node


def mesh_extent(gltf: dict[str, Any]) -> list[float]:
    """Size along X, Y, Z of the only mesh of the file, in the file's unit."""
    [mesh] = gltf["meshes"]
    [primitive] = mesh["primitives"]
    accessor = gltf["accessors"][primitive["attributes"]["POSITION"]]
    return [high - low for low, high in zip(accessor["min"], accessor["max"], strict=True)]


@pytest.fixture(scope="module")
def axis_run(
    axis_step: Path, tmp_path_factory: pytest.TempPathFactory
) -> tuple[ConverterRun, Path]:
    output_dir = tmp_path_factory.mktemp("axis_output")
    return run_converter(axis_step, output_dir), output_dir


def test_axis_lists_components_with_verbatim_names_and_paths(
    axis_run: tuple[ConverterRun, Path],
) -> None:
    run, _output_dir = axis_run
    assert run.exit_code == 0, run.stderr
    assert run.output == {
        "sourceUnit": "mm",
        "components": [
            {
                "file": "0.glb",
                "faceFile": "0.faces.json",
                "name": "rail",
                "nodes": [{"name": "fixture_axis", "path": [0]}, {"name": "rail", "path": [0, 0]}],
            },
            {
                "file": "1.glb",
                "faceFile": "1.faces.json",
                "name": "carriage",
                "nodes": [
                    {"name": "fixture_axis", "path": [0]},
                    {"name": "carriage", "path": [0, 1]},
                ],
            },
        ],
    }


def test_axis_writes_one_glb_and_one_face_file_per_component(
    axis_run: tuple[ConverterRun, Path],
) -> None:
    _run, output_dir = axis_run
    assert sorted(path.name for path in output_dir.iterdir()) == [
        "0.faces.json",
        "0.glb",
        "1.faces.json",
        "1.glb",
    ]
    rail = read_gltf_json(output_dir / "0.glb")
    assert {node["name"] for node in rail["nodes"]} == {"fixture_axis", "rail"}


def test_glb_is_in_metres_with_z_up_and_merged_faces(axis_run: tuple[ConverterRun, Path]) -> None:
    _run, output_dir = axis_run
    rail = read_gltf_json(output_dir / "0.glb")
    # A 1000 x 100 x 50 mm box: metres, and the 50 mm height stays on Z.
    assert mesh_extent(rail) == pytest.approx([1.0, 0.1, 0.05])
    carriage = read_gltf_json(output_dir / "1.glb")
    assert mesh_extent(carriage) == pytest.approx([0.1, 0.1, 0.1])


def test_component_placement_is_kept_as_node_transform(
    axis_run: tuple[ConverterRun, Path],
) -> None:
    _run, output_dir = axis_run
    carriage = node_named(read_gltf_json(output_dir / "1.glb"), "carriage")
    assert carriage["translation"] == pytest.approx([-0.4, 0.0, 0.02])
    # Half turn about Y as a quaternion [x, y, z, w].
    assert carriage["rotation"] == pytest.approx([0.0, 1.0, 0.0, 0.0], abs=1e-9)


def test_source_unit_in_metres_is_reported_and_converted(
    axis_step_in_metres: Path, tmp_path: Path
) -> None:
    run = run_converter(axis_step_in_metres, tmp_path)
    assert run.exit_code == 0, run.stderr
    assert run.output["sourceUnit"] == "m"
    carriage = read_gltf_json(tmp_path / "1.glb")
    assert mesh_extent(carriage) == pytest.approx([100.0, 100.0, 100.0])
    assert node_named(carriage, "carriage")["translation"] == pytest.approx([-400.0, 0.0, 20.0])


def test_single_part_is_one_component(single_part_step: Path, tmp_path: Path) -> None:
    run = run_converter(single_part_step, tmp_path)
    assert run.exit_code == 0, run.stderr
    assert run.output["components"] == [
        {
            "file": "0.glb",
            "faceFile": "0.faces.json",
            "name": "lonely_block",
            "nodes": [{"name": "lonely_block", "path": [0]}],
        }
    ]
    assert mesh_extent(read_gltf_json(tmp_path / "0.glb")) == pytest.approx([0.1, 0.1, 0.1])


def test_nested_assembly_keeps_duplicates_and_full_placement(
    nested_step: Path, tmp_path: Path
) -> None:
    run = run_converter(nested_step, tmp_path)
    assert run.exit_code == 0, run.stderr
    components = run.output["components"]
    assert [(component["name"], component["nodes"][-1]["path"]) for component in components] == [
        ("rail", [0, 0, 0]),
        ("carriage", [0, 0, 1]),
        ("foot", [0, 1]),
        ("foot", [0, 2]),
    ]
    assert [node["name"] for node in components[1]["nodes"]] == ["machine", "axis", "carriage"]

    carriage = read_gltf_json(tmp_path / components[1]["file"])
    assert node_named(carriage, "axis")["translation"] == pytest.approx([0.0, 0.0, 0.3])
    assert node_named(carriage, "carriage")["translation"] == pytest.approx([-0.4, 0.0, 0.02])
    second_foot = read_gltf_json(tmp_path / components[3]["file"])
    assert node_named(second_foot, "foot")["translation"] == pytest.approx([0.95, 0.0, 0.0])


@pytest.mark.parametrize(
    ("content", "expected_message"),
    [
        (b"", "empty"),
        (b"solid cube\nendsolid cube\n", "could not be read as STEP"),
    ],
)
def test_unreadable_file_exits_2_with_error(
    content: bytes, expected_message: str, tmp_path: Path
) -> None:
    input_path = tmp_path / "input.step"
    input_path.write_bytes(content)
    output_dir = tmp_path / "output"
    output_dir.mkdir()
    run = run_converter(input_path, output_dir)
    assert run.exit_code == 2
    assert list(run.output) == ["error"]
    assert expected_message in run.output["error"]
    assert "Traceback" not in run.stderr


def test_file_without_solid_exits_2_with_error(wire_only_step: Path, tmp_path: Path) -> None:
    run = run_converter(wire_only_step, tmp_path)
    assert run.exit_code == 2
    assert "no solid" in run.output["error"]
    assert list(tmp_path.iterdir()) == []


def test_missing_input_exits_2_with_error(tmp_path: Path) -> None:
    run = run_converter(tmp_path / "missing.step", tmp_path)
    assert run.exit_code == 2
    assert "does not exist" in run.output["error"]
