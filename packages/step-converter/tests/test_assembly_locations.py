"""Assembly node locations: composed along a chain they give the located leaf shape."""

import math

import pytest
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCP.gp import gp_Ax1, gp_Ax2, gp_Dir, gp_Pnt, gp_Quaternion, gp_Trsf, gp_Vec
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDataStd import TDataStd_Name
from OCP.TDF import TDF_Label
from OCP.TDocStd import TDocStd_Document
from OCP.TopAbs import TopAbs_SOLID
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS_Iterator, TopoDS_Shape
from OCP.XCAFDoc import XCAFDoc_DocumentTool, XCAFDoc_ShapeTool

from pantin_step_converter.assembly import find_leaf_components
from pantin_step_converter.conversion import assembly_node_placements
from pantin_step_converter.errors import UnusableStepFileError

# Document unit of the synthetic document: millimetres.
MILLIMETRE = 0.001


def _named(label: TDF_Label, name: str) -> TDF_Label:
    TDataStd_Name.Set_s(label, TCollection_ExtendedString(name))
    return label


def _location(offset: tuple[float, float, float], turn_about_y: float) -> TopLoc_Location:
    turn = gp_Trsf()
    turn.SetRotation(gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(0, 1, 0)), turn_about_y)
    shift = gp_Trsf()
    shift.SetTranslation(gp_Vec(*offset))
    return TopLoc_Location(shift.Multiplied(turn))


def _document() -> tuple[TDocStd_Document, XCAFDoc_ShapeTool]:
    document = TDocStd_Document(TCollection_ExtendedString("fixture"))
    return document, XCAFDoc_DocumentTool.ShapeTool_s(document.Main())


def _three_level_document(scale: float = 1.0, mirror: bool = False) -> TDocStd_Document:
    document, shape_tool = _document()
    root = _named(shape_tool.NewShape(), "root")
    middle = _named(shape_tool.NewShape(), "middle_part")
    bottom = _named(shape_tool.NewShape(), "bottom_part")
    part = _named(shape_tool.AddShape(BRepPrimAPI_MakeBox(10.0, 20.0, 30.0).Shape(), False), "p")
    _named(shape_tool.AddComponent(bottom, part, _location((1.0, 2.0, 3.0), 0.3)), "leaf")
    placement = _location((100.0, -50.0, 20.0), math.pi / 3)
    if mirror:
        mirrored = placement.Transformation()
        mirrored.SetMirror(gp_Ax2(gp_Pnt(0, 0, 0), gp_Dir(1, 0, 0)))
        placement = TopLoc_Location(mirrored)
    if scale != 1.0:
        scaled = placement.Transformation()
        scaled.SetScaleFactor(scale)
        placement = TopLoc_Location(scaled)
    _named(shape_tool.AddComponent(middle, bottom, placement), "bottom")
    _named(shape_tool.AddComponent(root, middle, _location((7.0, 8.0, 9.0), -1.0)), "middle")
    shape_tool.UpdateAssemblies()
    return document


def _transform_of(translation: tuple[float, ...], rotation: tuple[float, ...]) -> gp_Trsf:
    transform = gp_Trsf()
    transform.SetRotation(gp_Quaternion(*rotation))
    transform.SetTranslationPart(gp_Vec(*translation))
    return transform


def test_composed_locations_give_the_located_leaf_shape() -> None:
    document = _three_level_document()  # labels die with their document
    components = find_leaf_components(document)
    assert len(components) == 1
    leaf = components[0]
    placements = assembly_node_placements(components, 1.0)
    assert [placement.path for placement in placements] == [(0,), (0, 0), (0, 0, 0)]

    composed = gp_Trsf()
    for placement in placements:
        composed = composed.Multiplied(_transform_of(placement.translation, placement.rotation))
    # The leaf's own shape carries its instance location, as the last link of the chain.
    composed = composed.Multiplied(leaf.locations[-1].Transformation())

    # The root shape stores the solid in the root frame: its location is the whole chain.
    root_shape = XCAFDoc_ShapeTool.GetShape_s(leaf.root_label)
    expected = _deepest_location(root_shape)
    for point in (gp_Pnt(0, 0, 0), gp_Pnt(1, 0, 0), gp_Pnt(0, 1, 0), gp_Pnt(0, 0, 1)):
        got = point.Transformed(composed)
        want = point.Transformed(expected)
        assert (got.X(), got.Y(), got.Z()) == pytest.approx((want.X(), want.Y(), want.Z()))


def test_translations_are_converted_to_metres() -> None:
    document = _three_level_document()
    components = find_leaf_components(document)
    placements = assembly_node_placements(components, MILLIMETRE)
    assert placements[1].translation == pytest.approx((0.007, 0.008, 0.009))
    assert placements[2].translation == pytest.approx((0.1, -0.05, 0.02))


def test_scaled_instance_is_an_unusable_file() -> None:
    document = _three_level_document(scale=2.0)
    components = find_leaf_components(document)
    with pytest.raises(UnusableStepFileError, match="scale or a mirror"):
        assembly_node_placements(components, MILLIMETRE)


def _deepest_location(shape: TopoDS_Shape) -> gp_Trsf:
    """The cumulated location of the first solid below a compound."""
    iterator = TopoDS_Iterator(shape)
    while iterator.More():
        child = iterator.Value()
        if child.ShapeType() == TopAbs_SOLID:
            return child.Location().Transformation()
        return _deepest_location(child)
    raise AssertionError("no solid found")


def test_mirrored_instance_is_an_unusable_file() -> None:
    document = _three_level_document(mirror=True)
    components = find_leaf_components(document)
    with pytest.raises(UnusableStepFileError, match="scale or a mirror"):
        assembly_node_placements(components, MILLIMETRE)
