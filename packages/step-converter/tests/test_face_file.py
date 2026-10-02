"""Face files written next to the GLB files (ADR 0035)."""

import json
import struct
from pathlib import Path
from typing import Any

import pytest
from OCP.BRep import BRep_Builder
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCP.TopAbs import TopAbs_FACE
from OCP.TopExp import TopExp_Explorer
from OCP.TopoDS import TopoDS_Shell, TopoDS_Solid

from pantin_step_converter import conversion
from pantin_step_converter.__main__ import EXIT_OK, main
from pantin_step_converter.assembly import find_leaf_components
from pantin_step_converter.conversion import convert_step
from pantin_step_converter.errors import FaceMapMismatchError
from pantin_step_converter.face_map import build_face_file
from pantin_step_converter.glb_export import export_component_glb, tessellate
from pantin_step_converter.glb_file import read_accessor, read_glb
from pantin_step_converter.ocp_helpers import is_closed_solid
from pantin_step_converter.step_reader import read_step


def read_face_file(path: Path) -> dict[str, Any]:
    face_file = json.loads(path.read_text(encoding="utf-8"))
    assert isinstance(face_file, dict)
    return face_file


def planes(face_file: dict[str, Any]) -> set[tuple[tuple[float, ...], float]]:
    """Each plane as its outward normal and its signed distance from the origin, rounded."""
    found = set()
    for face in face_file["faces"]:
        if face["kind"] == "plane":
            normal = tuple(round(value, 9) + 0.0 for value in face["normal"])
            offset = sum(n * p for n, p in zip(face["normal"], face["point"], strict=True))
            found.add((normal, round(offset, 9) + 0.0))
    return found


@pytest.fixture(scope="module")
def axis_output(axis_step: Path, tmp_path_factory: pytest.TempPathFactory) -> Path:
    output_dir = tmp_path_factory.mktemp("axis_faces")
    convert_step(axis_step, output_dir)
    return output_dir


def test_face_file_records_its_format_and_writer(axis_output: Path) -> None:
    rail = read_face_file(axis_output / "0.faces.json")
    assert rail["formatVersion"] == 1
    assert rail["writer"].startswith("cadquery-ocp-novtk ")
    assert rail["solid"] is True


def test_ranges_cover_every_triangle_once_in_order(axis_output: Path) -> None:
    rail = read_face_file(axis_output / "0.faces.json")
    glb = read_glb(axis_output / "0.glb")
    for mapped in rail["primitives"]:
        primitive = glb.gltf["meshes"][mapped["mesh"]]["primitives"][mapped["primitive"]]
        triangle_count = len(read_accessor(glb, primitive["indices"])) // 3
        next_triangle = 0
        for first, count, _face_index in mapped["ranges"]:
            assert first == next_triangle
            assert count > 0
            next_triangle += count
        assert next_triangle == triangle_count
    face_indices = [
        face_range[2] for mapped in rail["primitives"] for face_range in mapped["ranges"]
    ]
    assert face_indices == list(range(len(rail["faces"])))


def test_box_planes_point_out_of_the_material_in_metres(axis_output: Path) -> None:
    # The rail is a 1000 x 100 x 50 mm box at the origin.
    assert planes(read_face_file(axis_output / "0.faces.json")) == {
        ((1.0, 0.0, 0.0), 1.0),
        ((-1.0, 0.0, 0.0), 0.0),
        ((0.0, 1.0, 0.0), 0.1),
        ((0.0, -1.0, 0.0), 0.0),
        ((0.0, 0.0, 1.0), 0.05),
        ((0.0, 0.0, -1.0), 0.0),
    }


def test_geometry_is_in_the_frame_where_the_glb_places_the_body(axis_output: Path) -> None:
    # The 100 mm carriage cube is turned half a turn about Y, then moved by
    # (-400, 0, 20) mm: it spans x in [-500, -400] and z in [-80, 20] mm.
    assert planes(read_face_file(axis_output / "1.faces.json")) == {
        ((1.0, 0.0, 0.0), -0.4),
        ((-1.0, 0.0, 0.0), 0.5),
        ((0.0, 1.0, 0.0), 0.1),
        ((0.0, -1.0, 0.0), 0.0),
        ((0.0, 0.0, 1.0), 0.02),
        ((0.0, 0.0, -1.0), 0.08),
    }


def test_a_bore_is_a_cylinder_with_its_axis_and_radius(
    bored_block_step: Path, tmp_path: Path
) -> None:
    convert_step(bored_block_step, tmp_path)
    face_file = read_face_file(tmp_path / "0.faces.json")
    [bore] = [face for face in face_file["faces"] if face["kind"] == "cylinder"]
    assert bore["radius"] == pytest.approx(0.005)
    assert [abs(value) for value in bore["direction"]] == pytest.approx([0.0, 0.0, 1.0])
    assert bore["point"][:2] == pytest.approx([0.02, 0.015])
    # The bore faces inward, but the block's six planes still point outward.
    assert len(planes(face_file)) == 6


def test_a_glb_that_does_not_match_the_walk_gets_no_map(axis_step: Path, tmp_path: Path) -> None:
    step = read_step(axis_step)
    rail, carriage = find_leaf_components(step.document)
    for component in (rail, carriage):
        tessellate(component.shape, step.document_unit_in_metres)
    converter = export_component_glb(step.document, carriage, tmp_path / "carriage.glb")
    with pytest.raises(FaceMapMismatchError):
        build_face_file(
            step.document,
            rail,
            tmp_path / "carriage.glb",
            converter,
            step.document_unit_in_metres,
        )


def test_a_failed_map_drops_the_face_file_not_the_body(
    single_part_step: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fail(*_arguments: object) -> None:
        raise FaceMapMismatchError("Triangles of face 3 differ.")

    monkeypatch.setattr(conversion, "build_face_file", fail)
    result = convert_step(single_part_step, tmp_path)
    [component] = result.components
    assert component.face_file is None
    assert component.face_file_problem == "Triangles of face 3 differ."
    assert result.to_json()["components"] == [
        {
            "file": "0.glb",
            "faceFile": None,
            "name": "lonely_block",
            "nodes": [{"name": "lonely_block", "path": [0]}],
        }
    ]
    assert sorted(path.name for path in tmp_path.iterdir()) == ["0.glb"]


def test_a_body_with_a_lone_face_is_not_a_solid(block_and_sheet_step: Path, tmp_path: Path) -> None:
    result = convert_step(block_and_sheet_step, tmp_path)
    assert [component.name for component in result.components] == ["block", "sheet"]
    assert read_face_file(tmp_path / "0.faces.json")["solid"] is True
    assert read_face_file(tmp_path / "1.faces.json")["solid"] is False


def test_a_solid_on_an_open_shell_is_not_closed() -> None:
    box = BRepPrimAPI_MakeBox(10.0, 10.0, 10.0).Shape()
    builder = BRep_Builder()
    open_shell = TopoDS_Shell()
    builder.MakeShell(open_shell)
    faces = TopExp_Explorer(box, TopAbs_FACE)
    faces.Next()  # The first face is left out.
    while faces.More():
        builder.Add(open_shell, faces.Current())
        faces.Next()
    open_solid = TopoDS_Solid()
    builder.MakeSolid(open_solid)
    builder.Add(open_solid, open_shell)
    assert is_closed_solid(box) is True
    assert is_closed_solid(open_solid) is False


def test_the_converter_says_which_body_has_no_face_file(
    single_part_step: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capfd: pytest.CaptureFixture[str],
) -> None:
    def fail(*_arguments: object) -> None:
        raise FaceMapMismatchError("Triangles of face 3 differ.")

    monkeypatch.setattr(conversion, "build_face_file", fail)
    exit_code = main(["--input", str(single_part_step), "--output-dir", str(tmp_path)])
    captured = capfd.readouterr()
    assert exit_code == EXIT_OK
    assert json.loads(captured.out)["components"][0]["faceFile"] is None
    assert (
        "pantin_step_converter: no face file for lonely_block: Triangles of face 3 differ."
        in captured.err
    )


def _swap_two_corners_of_the_first_triangle(glb_path: Path) -> None:
    """Turns the first triangle's winding without moving any node."""
    glb = read_glb(glb_path)
    indices = glb.gltf["meshes"][0]["primitives"][0]["indices"]
    accessor = glb.gltf["accessors"][indices]
    view = glb.gltf["bufferViews"][accessor["bufferView"]]
    index_format = {5123: "<H", 5125: "<I"}[accessor["componentType"]]
    size = struct.calcsize(index_format)
    data = bytearray(glb_path.read_bytes())
    # 12 byte header, 8 byte chunk header, the JSON chunk, 8 byte chunk header.
    (json_length,) = struct.unpack_from("<I", data, 12)
    first = 12 + 8 + json_length + 8 + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    second, third = first + size, first + 2 * size
    data[second:third], data[third : third + size] = data[third : third + size], data[second:third]
    glb_path.write_bytes(bytes(data))


def test_one_turned_triangle_is_enough_to_refuse_the_map(axis_step: Path, tmp_path: Path) -> None:
    step = read_step(axis_step)
    rail, _carriage = find_leaf_components(step.document)
    tessellate(rail.shape, step.document_unit_in_metres)
    converter = export_component_glb(step.document, rail, tmp_path / "rail.glb")
    _swap_two_corners_of_the_first_triangle(tmp_path / "rail.glb")
    with pytest.raises(FaceMapMismatchError, match="Triangles of face 0 differ"):
        build_face_file(
            step.document, rail, tmp_path / "rail.glb", converter, step.document_unit_in_metres
        )
