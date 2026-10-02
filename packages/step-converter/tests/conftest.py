"""Builds small STEP files with OpenCascade at test time.

The user's CAD files are never copied into the repository (ADR 0009), so every
fixture is generated here: boxes placed in named assemblies, a bored block, and
a block with a lone face.
"""

import math
from pathlib import Path

import pytest
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCP.gp import gp_Ax1, gp_Ax2, gp_Dir, gp_Pnt, gp_Trsf, gp_Vec
from OCP.IFSelect import IFSelect_RetDone
from OCP.Message import Message, Message_PrinterOStream
from OCP.STEPCAFControl import STEPCAFControl_Writer
from OCP.STEPControl import STEPControl_AsIs, STEPControl_Writer
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDataStd import TDataStd_Name
from OCP.TDF import TDF_Label
from OCP.TDocStd import TDocStd_Document
from OCP.TopAbs import TopAbs_FACE
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.XCAFDoc import XCAFDoc_DocumentTool, XCAFDoc_ShapeTool

# Lengths in millimetres, the unit OpenCascade writes by default.
RAIL_SIZE = (1000.0, 100.0, 50.0)
CARRIAGE_SIZE = (100.0, 100.0, 100.0)
CARRIAGE_TRANSLATION = (-400.0, 0.0, 20.0)
AXIS_TRANSLATION_IN_MACHINE = (0.0, 0.0, 300.0)
BORED_BLOCK_SIZE = (40.0, 30.0, 20.0)
# A through hole along Z.
BORE_CENTRE = (20.0, 15.0)
BORE_RADIUS = 5.0


def _named(label: TDF_Label, name: str) -> TDF_Label:
    TDataStd_Name.Set_s(label, TCollection_ExtendedString(name))
    return label


def _box_part(
    shape_tool: XCAFDoc_ShapeTool, name: str, size: tuple[float, float, float]
) -> TDF_Label:
    return _named(shape_tool.AddShape(BRepPrimAPI_MakeBox(*size).Shape(), False), name)


def _translation(offset: tuple[float, float, float]) -> gp_Trsf:
    transform = gp_Trsf()
    transform.SetTranslation(gp_Vec(*offset))
    return transform


def _carriage_placement() -> TopLoc_Location:
    """Translation plus a half turn about Y, like the carriage of spike 0001."""
    half_turn = gp_Trsf()
    half_turn.SetRotation(gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(0, 1, 0)), math.pi)
    return TopLoc_Location(_translation(CARRIAGE_TRANSLATION).Multiplied(half_turn))


def _new_document() -> tuple[TDocStd_Document, XCAFDoc_ShapeTool]:
    document = TDocStd_Document(TCollection_ExtendedString("fixture"))
    return document, XCAFDoc_DocumentTool.ShapeTool_s(document.Main())


def _add_axis(shape_tool: XCAFDoc_ShapeTool, assembly: TDF_Label) -> None:
    rail = _box_part(shape_tool, "rail_part", RAIL_SIZE)
    carriage = _box_part(shape_tool, "carriage_part", CARRIAGE_SIZE)
    _named(shape_tool.AddComponent(assembly, rail, TopLoc_Location()), "rail")
    _named(shape_tool.AddComponent(assembly, carriage, _carriage_placement()), "carriage")


def _write_document(document: TDocStd_Document, path: Path) -> Path:
    writer = STEPCAFControl_Writer()
    writer.SetNameMode(True)
    assert writer.Transfer(document, STEPControl_AsIs)
    assert writer.Write(str(path)) == IFSelect_RetDone
    return path


@pytest.fixture(scope="session", autouse=True)
def _quiet_opencascade() -> None:
    """OpenCascade prints transfer statistics from C++ when the test process
    exits, after pytest stops capturing output; nobody reads them here."""
    Message.DefaultMessenger_s().RemovePrinters(Message_PrinterOStream.get_type_descriptor_s())


@pytest.fixture(scope="session")
def fixtures_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return tmp_path_factory.mktemp("step_fixtures")


@pytest.fixture(scope="session")
def axis_step(fixtures_dir: Path) -> Path:
    """Assembly "fixture_axis": components "rail" and "carriage"."""
    document, shape_tool = _new_document()
    assembly = _named(shape_tool.NewShape(), "fixture_axis")
    _add_axis(shape_tool, assembly)
    shape_tool.UpdateAssemblies()
    return _write_document(document, fixtures_dir / "axis.step")


@pytest.fixture(scope="session")
def axis_step_in_metres(axis_step: Path, fixtures_dir: Path) -> Path:
    """The same assembly declared in metres: every length is 1000 times larger."""
    millimetre_unit = "SI_UNIT(.MILLI.,.METRE.)"
    text = axis_step.read_text(encoding="utf-8")
    assert millimetre_unit in text
    path = fixtures_dir / "axis_metres.step"
    path.write_text(text.replace(millimetre_unit, "SI_UNIT($,.METRE.)"), encoding="utf-8")
    return path


@pytest.fixture(scope="session")
def single_part_step(fixtures_dir: Path) -> Path:
    """One box, no assembly."""
    document, shape_tool = _new_document()
    _box_part(shape_tool, "lonely_block", CARRIAGE_SIZE)
    return _write_document(document, fixtures_dir / "single.step")


@pytest.fixture(scope="session")
def nested_step(fixtures_dir: Path) -> Path:
    """Assembly "machine": a sub-assembly "axis" and two components both named "foot"."""
    document, shape_tool = _new_document()
    machine = _named(shape_tool.NewShape(), "machine")
    axis = _named(shape_tool.NewShape(), "axis_assembly")
    _add_axis(shape_tool, axis)
    axis_placement = TopLoc_Location(_translation(AXIS_TRANSLATION_IN_MACHINE))
    _named(shape_tool.AddComponent(machine, axis, axis_placement), "axis")
    foot = _box_part(shape_tool, "foot_part", (50.0, 50.0, 300.0))
    _named(shape_tool.AddComponent(machine, foot, TopLoc_Location()), "foot")
    foot_placement = TopLoc_Location(_translation((950.0, 0.0, 0.0)))
    _named(shape_tool.AddComponent(machine, foot, foot_placement), "foot")
    shape_tool.UpdateAssemblies()
    return _write_document(document, fixtures_dir / "nested.step")


@pytest.fixture(scope="session")
def bored_block_step(fixtures_dir: Path) -> Path:
    """One block with a through hole: plane and cylinder faces."""
    document, shape_tool = _new_document()
    block = BRepPrimAPI_MakeBox(*BORED_BLOCK_SIZE).Shape()
    bore_axis = gp_Ax2(gp_Pnt(*BORE_CENTRE, -1.0), gp_Dir(0, 0, 1))
    bore = BRepPrimAPI_MakeCylinder(bore_axis, BORE_RADIUS, BORED_BLOCK_SIZE[2] + 2.0).Shape()
    _named(shape_tool.AddShape(BRepAlgoAPI_Cut(block, bore).Shape(), False), "bored_block")
    return _write_document(document, fixtures_dir / "bored_block.step")


@pytest.fixture(scope="session")
def block_and_sheet_step(fixtures_dir: Path) -> Path:
    """Assembly "covered_block": a box "block" and a lone face "sheet" lying on it."""
    document, shape_tool = _new_document()
    assembly = _named(shape_tool.NewShape(), "covered_block")
    block = _box_part(shape_tool, "block_part", BORED_BLOCK_SIZE)
    sheet_face = TopExp_Explorer(BRepPrimAPI_MakeBox(*BORED_BLOCK_SIZE).Shape(), TopAbs_FACE)
    sheet = _named(shape_tool.AddShape(sheet_face.Current(), False), "sheet_part")
    _named(shape_tool.AddComponent(assembly, block, TopLoc_Location()), "block")
    _named(shape_tool.AddComponent(assembly, sheet, TopLoc_Location()), "sheet")
    shape_tool.UpdateAssemblies()
    return _write_document(document, fixtures_dir / "block_and_sheet.step")


@pytest.fixture(scope="session")
def wire_only_step(fixtures_dir: Path) -> Path:
    """A valid STEP file whose only shape is an edge: nothing to turn into a body."""
    writer = STEPControl_Writer()
    writer.Transfer(
        BRepBuilderAPI_MakeEdge(gp_Pnt(0, 0, 0), gp_Pnt(10, 0, 0)).Edge(), STEPControl_AsIs
    )
    path = fixtures_dir / "wire.step"
    assert writer.Write(str(path)) == IFSelect_RetDone
    return path
