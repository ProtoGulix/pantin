"""Walks the assembly tree of an XCAF document down to its leaf components."""

from collections.abc import Iterator
from dataclasses import dataclass

from OCP.collections import Sequence_TDF_Label
from OCP.TCollection import TCollection_AsciiString
from OCP.TDataStd import TDataStd_Name
from OCP.TDF import TDF_Label
from OCP.TDocStd import TDocStd_Document
from OCP.TopoDS import TopoDS_Shape
from OCP.XCAFDoc import XCAFDoc_DocumentTool, XCAFDoc_ShapeTool
from OCP.XCAFPrs import XCAFPrs_DocumentExplorer

from pantin_step_converter.ocp_helpers import labels_of


@dataclass(frozen=True)
class SourceNode:
    """A node of the STEP tree: its name verbatim and its indices from the file root."""

    name: str
    path: tuple[int, ...]


@dataclass(frozen=True)
class LeafComponent:
    """A part that is not an assembly: it becomes one GLB, hence one body."""

    # The nodes from the root of the file down to this component, the component last.
    nodes: tuple[SourceNode, ...]
    # The glTF writer selects nodes by these identifiers, one per node above.
    explorer_ids: tuple[str, ...]
    root_label: TDF_Label
    # The component's shape, located where the assembly places it.
    shape: TopoDS_Shape

    @property
    def name(self) -> str:
        return self.nodes[-1].name


@dataclass(frozen=True)
class _VisitedNode:
    source: SourceNode
    explorer_id: str


def find_leaf_components(document: TDocStd_Document) -> list[LeafComponent]:
    shape_tool = XCAFDoc_DocumentTool.ShapeTool_s(document.Main())
    roots = Sequence_TDF_Label()
    shape_tool.GetFreeShapes(roots)
    leaves: list[LeafComponent] = []
    for root_index, root_label in enumerate(labels_of(roots)):
        leaves.extend(_leaves_under(root_label, root_label, (root_index,), ()))
    return leaves


def _leaves_under(
    label: TDF_Label,
    root_label: TDF_Label,
    path: tuple[int, ...],
    ancestors: tuple[_VisitedNode, ...],
) -> Iterator[LeafComponent]:
    parent_id = ancestors[-1].explorer_id if ancestors else ""
    node = _VisitedNode(
        source=SourceNode(name=_label_name(label), path=path),
        explorer_id=_explorer_id(label, parent_id),
    )
    chain = (*ancestors, node)
    definition = _definition_of(label)
    if XCAFDoc_ShapeTool.IsAssembly_s(definition):
        components = Sequence_TDF_Label()
        XCAFDoc_ShapeTool.GetComponents_s(definition, components)
        for child_index, child in enumerate(labels_of(components)):
            yield from _leaves_under(child, root_label, (*path, child_index), chain)
        return
    yield LeafComponent(
        nodes=tuple(visited.source for visited in chain),
        explorer_ids=tuple(visited.explorer_id for visited in chain),
        root_label=root_label,
        shape=XCAFDoc_ShapeTool.GetShape_s(label),
    )


def _definition_of(label: TDF_Label) -> TDF_Label:
    """Return the label that holds the shape definition behind an assembly instance."""
    if not XCAFDoc_ShapeTool.IsReference_s(label):
        return label
    definition = TDF_Label()
    XCAFDoc_ShapeTool.GetReferredShape_s(label, definition)
    return definition


def _label_name(label: TDF_Label) -> str:
    """Instance name first, as CAD tools show it; the definition name when the instance has none."""
    for candidate in (label, _definition_of(label)):
        name = _own_name(candidate)
        if name:
            return name
    return ""


def _own_name(label: TDF_Label) -> str:
    name_attribute = TDataStd_Name()
    if not label.FindAttribute(TDataStd_Name.GetID_s(), name_attribute):
        return ""
    return str(name_attribute.Get().ToExtString())


def _explorer_id(label: TDF_Label, parent_id: str) -> str:
    child_id = XCAFPrs_DocumentExplorer.DefineChildId_s(label, TCollection_AsciiString(parent_id))
    return str(child_id.ToCString())
