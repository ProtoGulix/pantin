"""Small adapters between OpenCascade collections and Python."""

from OCP.collections import Sequence_TDF_Label
from OCP.TDF import TDF_Label
from OCP.TopAbs import TopAbs_ShapeEnum
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
