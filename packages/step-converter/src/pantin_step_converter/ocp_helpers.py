"""Small adapters between OpenCascade collections and Python."""

from OCP.BRep import BRep_Tool
from OCP.collections import Sequence_TDF_Label
from OCP.TDF import TDF_Label
from OCP.TopAbs import TopAbs_FACE, TopAbs_ShapeEnum, TopAbs_SHELL, TopAbs_SOLID
from OCP.TopExp import TopExp_Explorer
from OCP.TopoDS import TopoDS_Shape


def labels_of(sequence: Sequence_TDF_Label) -> list[TDF_Label]:
    # OpenCascade sequences are indexed from 1.
    return [sequence.Value(index) for index in range(1, sequence.Length() + 1)]


def count_subshapes(shape: TopoDS_Shape, kind: TopAbs_ShapeEnum) -> int:
    count = 0
    explorer = TopExp_Explorer(shape, kind)
    while explorer.More():
        count += 1
        explorer.Next()
    return count


def is_closed_solid(shape: TopoDS_Shape) -> bool:
    """Every face lies in a solid and every shell is closed (each edge bounds two faces).

    A solid built on an open shell, which some exporters write, is not closed.
    """
    has_solid = TopExp_Explorer(shape, TopAbs_SOLID).More()
    has_free_face = TopExp_Explorer(shape, TopAbs_FACE, TopAbs_SOLID).More()
    shells = TopExp_Explorer(shape, TopAbs_SHELL)
    while shells.More():
        if not BRep_Tool.IsClosed_s(shells.Current()):
            return False
        shells.Next()
    return has_solid and not has_free_face
